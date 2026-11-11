// packages/main/src/libs/mcp/connection.ts
// packages/main/src/libs/mcp/connection.ts
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { randomUUID } from "node:crypto";
import pMap from "p-map";
import PQueue from "p-queue";
import {
    closeMcpClient,
    connectMcpServer,
    resolveMcpToolDescription,
    type McpClient,
} from "./client.js";
import {
    McpLeaseReleasedError,
    McpRouteClosedError,
    McpServerDisabledError,
    McpServerNotConfiguredError,
    McpToolNotExecutableError,
    McpToolNotFoundError,
} from "./errors.js";
import { stableStringify } from "./stable.js";
import type {
    McpConnectionLease,
    McpServerConfig,
    McpServerToolSnapshot,
    McpToolCallOptions,
    McpToolDescriptor,
    SetServersResult,
} from "./type.js";
import { wrapMcpTool } from "./wrap.js";

const CLOSE_CONCURRENCY = 4;
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface ConfigRecord {
    cfg: McpServerConfig;
    key: string;
}

interface Entry {
    serverId: string;
    cfgKey: string;
    generation: number;
    client: McpClient;
    tools: Record<string, Tool>;
    descriptors: McpToolDescriptor[];
    refCount: number;
    state: "ready" | "draining" | "closed";
    closePromise?: Promise<void>;
    /** 引用归零后启动的 idle 计时器；再次 acquire 会清除。 */
    idleTimer?: ReturnType<typeof setTimeout>;
}

export interface McpConnectionPoolOptions {
    /** 测试注入点，默认走真实连接。 */
    connect?: typeof connectMcpServer;
    /** 测试注入点，默认走真实关闭。 */
    close?: typeof closeMcpClient;
    /**
     * 引用归零后的空闲超时（毫秒）。超时后自动关闭连接，
     * 下次真实调用会重新连接（懒加载）。默认 5 分钟。
     * 设为 0 或负数表示不超时（不推荐）。
     */
    idleTimeoutMs?: number;
}

/**
 * MCP 连接池：以 serverId 为键管理配置与连接。
 *
 * 懒加载 + idle 超时：
 *   - init / setServers 只管理配置，不连接；
 *   - discoverTools / acquire / callTool 触发惰性连接；
 *   - 连接被引用期间（refCount > 0）不关闭；
 *   - 引用归零后启动 idle 计时器，超时关闭；再次 acquire 取消计时器并复用。
 *
 * 状态机：
 *   ready    ── retire ──▶ draining ── refCount==0 ──▶ closed
 *   ready    ── retire ──▶ closed    （refCount==0 时立即关闭）
 *   ready    ── idle 超时 ─▶ closed  （refCount==0 时由计时器触发）
 *
 * 并发：
 *   - 所有状态变更经过单并发 p-queue 串行化；
 *   - close() 中多个独立 entry 用 p-map 并发关闭。
 */
export class McpConnectionPool {
    readonly #queue = new PQueue({ concurrency: 1 });
    readonly #configs = new Map<string, ConfigRecord>();
    readonly #entries = new Map<string, Entry>();
    readonly #connect: typeof connectMcpServer;
    readonly #close: typeof closeMcpClient;
    readonly #idleTimeoutMs: number;
    #closed = false;
    #generation = 0;

    constructor(opts: McpConnectionPoolOptions = {}) {
        this.#connect = opts.connect ?? connectMcpServer;
        this.#close = opts.close ?? closeMcpClient;
        this.#idleTimeoutMs =
            opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    }

    // ---------- 配置对齐（不连接） ----------

    async init(servers: McpServerConfig[] = []): Promise<SetServersResult> {
        return this.#queue.add(async () => {
            this.#closed = false;
            return this.#setServersNow(servers);
        });
    }

    async setServers(servers: McpServerConfig[]): Promise<SetServersResult> {
        return this.#queue.add(async () => {
            if (this.#closed) throw new McpRouteClosedError();
            return this.#setServersNow(servers);
        });
    }

    async #setServersNow(
        servers: McpServerConfig[],
    ): Promise<SetServersResult> {
        if (this.#closed) throw new McpRouteClosedError();

        const byId = new Map(servers.map((s) => [s.id, s]));
        const desired = new Set(byId.keys());

        const removed: string[] = [];
        for (const id of [...this.#configs.keys()]) {
            if (!desired.has(id)) {
                await this.#removeNow(id);
                removed.push(id);
            }
        }

        const changed: string[] = [];
        const unchanged: string[] = [];
        for (const cfg of byId.values()) {
            const configChanged = await this.#upsertNow(cfg);
            if (cfg.enabled === false) {
                if (configChanged) removed.push(cfg.id);
                else unchanged.push(cfg.id);
            } else if (configChanged) {
                changed.push(cfg.id);
            } else {
                unchanged.push(cfg.id);
            }
        }
        return { changed, removed, unchanged };
    }

    async upsertServer(cfg: McpServerConfig): Promise<{ changed: boolean }> {
        return this.#queue.add(async () => {
            if (this.#closed) throw new McpRouteClosedError();
            const changed = await this.#upsertNow(cfg);
            return { changed };
        });
    }

    async removeServer(serverId: string): Promise<void> {
        return this.#queue.add(async () => {
            if (this.#closed) throw new McpRouteClosedError();
            await this.#removeNow(serverId);
        });
    }

    async #upsertNow(cfg: McpServerConfig): Promise<boolean> {
        const key = stableStringify(cfg);
        const prevCfg = this.#configs.get(cfg.id);
        const prevEntry = this.#entries.get(cfg.id);
        const unchanged = prevCfg?.key === key;

        if (unchanged) {
            if (cfg.enabled === false && prevEntry) {
                await this.#retireEntry(prevEntry);
            }
            return false;
        }

        if (prevEntry) await this.#retireEntry(prevEntry);
        this.#configs.set(cfg.id, { cfg, key });
        return true;
    }

    async #removeNow(serverId: string): Promise<void> {
        const entry = this.#entries.get(serverId);
        if (entry) await this.#retireEntry(entry);
        this.#configs.delete(serverId);
    }

    // ---------- 惰性连接 ----------

    async discoverTools(serverId: string): Promise<McpToolDescriptor[]> {
        return this.#queue.add(async () => {
            if (this.#closed) throw new McpRouteClosedError();
            const entry = await this.#ensureEntry(serverId);
            // discover 不持有引用，若本次新建则立即进入 idle 计时，
            // 若已有连接且 refCount 为 0 则刷新计时器。
            this.#armIdleTimerIfIdle(entry);
            return entry.descriptors;
        });
    }

    async #connectEntry(
        cfg: McpServerConfig,
        key: string,
    ): Promise<Entry> {
        const { client, tools } = await this.#connect(cfg);
        const descriptors: McpToolDescriptor[] = Object.entries(tools).map(
            ([name, raw]) => ({
                serverId: cfg.id,
                name,
                description: resolveMcpToolDescription(raw),
                configFingerprint: key,
                tool: wrapMcpTool({
                    serverId: cfg.id,
                    name,
                    raw,
                    call: this.callTool.bind(this),
                }),
            }),
        );
        return {
            serverId: cfg.id,
            cfgKey: key,
            generation: ++this.#generation,
            client,
            tools,
            descriptors,
            refCount: 0,
            state: "ready",
        };
    }

    async #ensureEntry(serverId: string): Promise<Entry> {
        const cfg = this.#configs.get(serverId);
        if (!cfg) throw new McpServerNotConfiguredError(serverId);
        if (cfg.cfg.enabled === false) {
            throw new McpServerDisabledError(serverId);
        }
        const existing = this.#entries.get(serverId);
        if (
            existing &&
            existing.cfgKey === cfg.key &&
            existing.state === "ready"
        ) {
            return existing;
        }
        if (existing) await this.#retireEntry(existing);

        const entry = await this.#connectEntry(cfg.cfg, cfg.key);
        this.#entries.set(serverId, entry);
        Logger.debug(`[MCP] [${serverId}] 已连接（懒加载）。`);
        return entry;
    }

    // ---------- idle 计时器 ----------

    #clearIdleTimer(entry: Entry): void {
        if (!entry.idleTimer) return;
        clearTimeout(entry.idleTimer);
        entry.idleTimer = undefined;
    }

    #armIdleTimerIfIdle(entry: Entry): void {
        if (this.#idleTimeoutMs <= 0) return;
        if (entry.refCount !== 0) return;
        if (entry.state !== "ready") return;

        this.#clearIdleTimer(entry);
        const timer = setTimeout(() => {
            void this.#queue
                .add(() => this.#maybeCloseIdle(entry))
                .catch((e) => {
                    Logger.warn(
                        `[MCP] [${entry.serverId}] idle 关闭失败:`,
                        e,
                    );
                });
        }, this.#idleTimeoutMs);
        // 让计时器不阻塞进程退出。
        timer.unref?.();
        entry.idleTimer = timer;
    }

    async #maybeCloseIdle(entry: Entry): Promise<void> {
        // 期间可能被 acquire / 替换 / 已关闭，重新校验。
        if (entry.state !== "ready") return;
        if (entry.refCount !== 0) return;
        if (this.#entries.get(entry.serverId) !== entry) return;

        Logger.debug(
            `[MCP] [${entry.serverId}] idle 超时（${this.#idleTimeoutMs}ms），关闭连接。`,
        );
        await this.#retireEntry(entry);
    }

    // ---------- 租约 ----------

    async acquire(serverId: string): Promise<McpConnectionLease> {
        return this.#queue.add(async () => {
            if (this.#closed) throw new McpRouteClosedError();
            const entry = await this.#ensureEntry(serverId);
            // 即将被引用，取消 idle 计时。
            this.#clearIdleTimer(entry);
            entry.refCount++;

            let released = false;
            return {
                serverId,
                generation: entry.generation,
                tools: entry.tools,
                callTool: async (
                    toolName: string,
                    args: unknown,
                    options?: McpToolCallOptions,
                ) => {
                    if (released) throw new McpLeaseReleasedError(serverId);
                    return this.#invoke(entry, toolName, args, options);
                },
                release: () => {
                    if (released) return;
                    released = true;
                    void this.#queue
                        .add(() => this.#releaseEntry(entry))
                        .catch((e) => {
                            Logger.warn(
                                `[MCP] [${serverId}] release 失败:`,
                                e,
                            );
                        });
                },
            } satisfies McpConnectionLease;
        });
    }

    async #releaseEntry(entry: Entry): Promise<void> {
        if (entry.refCount <= 0) return;
        entry.refCount--;
        if (entry.refCount !== 0) return;

        if (entry.state === "draining") {
            // 配置已变更：引用归零立即关闭。
            await this.#closeEntry(entry);
        } else if (entry.state === "ready") {
            // 配置仍有效：进入 idle 计时，超时再关闭。
            this.#armIdleTimerIfIdle(entry);
        }
    }

    async #retireEntry(entry: Entry): Promise<void> {
        if (entry.state === "closed") return;
        if (entry.state === "ready") entry.state = "draining";
        if (this.#entries.get(entry.serverId) === entry) {
            this.#entries.delete(entry.serverId);
        }
        if (entry.refCount === 0) {
            await this.#closeEntry(entry);
        }
    }

    async #closeEntry(entry: Entry): Promise<void> {
        this.#clearIdleTimer(entry);
        if (entry.state === "closed") {
            await entry.closePromise;
            return;
        }
        entry.state = "closed";
        entry.closePromise = this.#close(entry.serverId, entry.client);
        await entry.closePromise;
    }

    // ---------- 调用 ----------

    async callTool(
        serverId: string,
        toolName: string,
        args: unknown,
        options?: McpToolCallOptions,
    ): Promise<unknown> {
        const lease = await this.acquire(serverId);
        try {
            return await lease.callTool(toolName, args, options);
        } finally {
            lease.release();
        }
    }

    async #invoke(
        entry: Entry,
        toolName: string,
        args: unknown,
        options?: McpToolCallOptions,
    ): Promise<unknown> {
        const raw = entry.tools[toolName];
        if (!raw) throw new McpToolNotFoundError(entry.serverId, toolName);

        const execute = raw.execute;
        if (typeof execute !== "function") {
            throw new McpToolNotExecutableError(entry.serverId, toolName);
        }

        const execOptions = {
            toolCallId:
                options?.toolCallId ??
                `mcp:${entry.serverId}:${toolName}:${randomUUID()}`,
            messages: options?.messages ?? [],
            abortSignal: options?.abortSignal,
        };

        return await (
            execute as (
                input: unknown,
                options: typeof execOptions,
            ) => Promise<unknown>
        )(args, execOptions);
    }

    // ---------- 查询 ----------

    async listServerTools(): Promise<McpServerToolSnapshot[]> {
        return this.#queue.add(async () => {
            return [...this.#configs.keys()].map((serverId) => {
                const entry = this.#entries.get(serverId);
                return {
                    serverId,
                    connected: entry?.state === "ready",
                    tools: entry?.descriptors ?? [],
                };
            });
        });
    }

    // ---------- 生命周期 ----------

    async close(): Promise<void> {
        return this.#queue.add(async () => {
            if (this.#closed) return;
            this.#closed = true;

            const entries = [...this.#entries.values()];
            this.#entries.clear();
            this.#configs.clear();

            // #closeEntry 内会清理 idleTimer；#retireEntry 也走 #closeEntry。
            await pMap(entries, (entry) => this.#retireEntry(entry), {
                concurrency: CLOSE_CONCURRENCY,
            });
        });
    }
}