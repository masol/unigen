// packages/main/src/libs/coderuntime/manager.ts
//
// 代码运行时管理器：应用级单例。
//
// 职责边界（本次重构后）：
//   - **零私有状态**：所有引擎状态（含历史安装进度）持久化在 StableConfig，
//     由 `#readStatus / #writeStatus` 统一读写；
//   - **只保留瞬时调度状态**：`#chains` / `#inflight` / `#registeredTools`
//     是"每进程"的缓存，不参与持久化（进程退出即丢失，符合语义）；
//   - **引擎实例化**：按 `engines/index.js` 的 `ENGINE_CLASSES` 在构造
//     函数里 `new`，不依赖模块级单例；
//   - `init()` 承担启动编排；依赖 `StableConfig` 与 `GlobalToolDB`；
//   - **工具注册/注销内部闭环**：`ensureEngine` 成功后自动注册；
//     `disableEngine` 负责注销；`#registerEngineTool` 永不暴露到外部；
//   - **下载前测速**：manager 主动 `probeUrls + sortByLatency` 排序候选源；
//   - **下载后 SHA256 校验**：`archiveSha256` 配置优先；用户未自定义
//     `archiveUrl` 时，回落到引擎给出的默认哈希；
//   - **解压允许引擎定制**：`getExtractAllowSymlinks?.()` 控制 tar 归档
//     中符号链接的放行策略（默认 false，通用安全策略）；
//   - 每次状态跃迁点直接调用 `report / complete / fail`
//     （`$libs/utils/task-progress.js`），`id = "code-runtime:" + engineId`。
//
// 状态持久化规则：
//   - 进入 / 离开 `installing`、`ready`、`failed`、`interrupted` 时**强制写**；
//   - 内部阶段推进按 `PROGRESS_PERSIST_INTERVAL_MS` 节流；
//   - 重启时 `installing` 会被收敛为 `interrupted`。

import { extractArchive } from "$libs/loader/archive.js";
import { download, type DownloadSource } from "$libs/loader/downloader.js";
import { sha256FileHex } from "$libs/loader/hash.js";
import { probeUrls, sortByLatency } from "$libs/loader/probe.js";
import { stableConfig } from "$libs/store/stable.js";
import { globalToolDB } from "$libs/tooldb/globaltooldb.js";
import { builtinId } from "$libs/tooldb/naming.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import {
    codeRuntimeDir,
    codeRuntimeDownloadDir,
} from "$libs/utils/sys/dir.js";
import { complete, fail, report } from "$libs/utils/task-progress.js";
import type {
    CodeRuntimeEngineConfig,
    CodeRuntimeEngineId,
    CodeRuntimeEngineState,
    CodeRuntimeEngineStatus,
    CodeRuntimeStatus,
} from "$types/appconfig.js";
import Logger from "electron-log/main.js";
import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import {
    ENGINE_CLASSES,
    isKnownEngine,
    KNOWN_ENGINE_IDS,
} from "./engines/index.js";
import type { EngineRuntimeHandler, ReadyRuntime } from "./types.js";

/** Windows MAX_PATH 260；预留 buffer，超过则预警。 */
const WINDOWS_MAX_SAFE_PATH = 200;

/** 内部进度持久化节流间隔。 */
const PROGRESS_PERSIST_INTERVAL_MS = 3_000;

/** 下载前对候选源并发测速的超时（每源）。 */
const DOWNLOAD_PROBE_TIMEOUT_MS = 8_000;

type RegisterToolFn = (
    def: ToolDefinition<unknown, unknown>,
) => Promise<unknown>;

async function pathExists(target: string): Promise<boolean> {
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
}

async function clearDir(dir: string): Promise<void> {
    if (!(await pathExists(dir))) return;
    await fs.rm(dir, { recursive: true, force: true });
}

function deriveArchiveFilename(
    url: string,
    fallbackExt: ".zip" | ".tar.gz",
): string {
    try {
        const parsed = new URL(url);
        const last = basename(parsed.pathname);
        if (last && !/[\\/]/.test(last)) {
            const safe = last.replace(/[^a-zA-Z0-9._-]/g, "_");
            if (safe) return safe;
        }
    } catch {
        // ignore
    }
    return `archive_${Date.now()}${fallbackExt}`;
}

function requiredRelPath(
    engineId: CodeRuntimeEngineId,
    rel: string | undefined,
): string | undefined {
    if (!rel) {
        Logger.warn(
            `[CodeRuntime] 引擎 [${engineId}] 在当前平台没有可执行文件约定。`,
        );
    }
    return rel;
}

function buildArchiveSources(
    handler: { id: CodeRuntimeEngineId },
    urls: readonly string[],
): DownloadSource[] {
    return urls.map((url, index) => ({
        url,
        label: `${handler.id}#${index}`,
    }));
}

function taskIdOf(engineId: CodeRuntimeEngineId): string {
    return `code-runtime:${engineId}`;
}

export interface CodeRuntimeInitOptions {
    /** 工具注册回调；缺省 `globalToolDB.register`。 */
    registerTool?: RegisterToolFn;
}

export interface EnsureEngineOptions {
    /**
     * 本次 ensure 的工具注册回调。
     *
     * 缺省使用 `globalToolDB.register`；`init()` 显式传入以支持未来测试注入。
     * 外部调用（如 API 层 `setRuntimeEnabled`）通常无需传入。
     */
    registerTool?: RegisterToolFn;
}

/**
 * 引擎状态与 init 并发保护。
 *
 * `#chains`         ：单引擎串行队列（用于 ensureEngine 串行化）；
 * `#inflight`       ：ensure 复用（同一引擎进行中调用直接排队）；
 * `#registeredTools`：已注册工具名（engineId → tool.name），
 *                     与 `#chains` 一样是进程级缓存，不做持久化。
 */
export class CodeRuntimeManager {
    #engines: Map<CodeRuntimeEngineId, EngineRuntimeHandler>;
    #chains = new Map<CodeRuntimeEngineId, Promise<unknown>>();
    #inflight = new Map<CodeRuntimeEngineId, Promise<CodeRuntimeEngineStatus>>();
    #registeredTools = new Map<CodeRuntimeEngineId, string>();
    #lastProgressPersist = new Map<
        CodeRuntimeEngineId,
        { percent: number; time: number }
    >();

    constructor() {
        this.#engines = new Map();
        for (const Klass of ENGINE_CLASSES) {
            const instance = new Klass();
            this.#engines.set(instance.id, instance);
        }
        if (this.#engines.size === 0) {
            Logger.warn("[CodeRuntime] 未注册任何引擎类，功能将不可用。");
        }
    }

    /** 引擎 handler 查找（供内部使用）。 */
    #getHandler(engineId: CodeRuntimeEngineId): EngineRuntimeHandler | undefined {
        return this.#engines.get(engineId);
    }

    // ---------- 持久化状态读写 ----------

    #readStatus(engineId: CodeRuntimeEngineId): CodeRuntimeEngineStatus {
        const all = stableConfig().get("codeRuntimeStatus");
        return all.engines?.[engineId] ?? { state: "not_ready" };
    }

    #readAllStatus(): CodeRuntimeStatus {
        const all = stableConfig().get("codeRuntimeStatus");
        return {
            engines: { ...(all.engines ?? {}) },
            updatedAt: all.updatedAt ?? 0,
        };
    }

    #writeStatus(
        engineId: CodeRuntimeEngineId,
        patch: Partial<Omit<CodeRuntimeEngineStatus, "state">> & {
            state?: CodeRuntimeEngineState;
        },
    ): CodeRuntimeEngineStatus {
        const current = this.#readStatus(engineId);
        const next: CodeRuntimeEngineStatus = {
            ...current,
            state: patch.state ?? current.state,
            lastCheckAt: Date.now(),
        };
        if (patch.installedRoot !== undefined) next.installedRoot = patch.installedRoot;
        if (patch.lastError !== undefined) next.lastError = patch.lastError;
        if (patch.phase !== undefined) next.phase = patch.phase;
        if (patch.message !== undefined) next.message = patch.message;
        if (patch.progress !== undefined) next.progress = patch.progress;
        if (patch.verifiedVersion !== undefined) next.verifiedVersion = patch.verifiedVersion;

        const all = this.#readAllStatus();
        const nextAll: CodeRuntimeStatus = {
            engines: { ...all.engines, [engineId]: next },
            updatedAt: Date.now(),
        };
        try {
            stableConfig().set("codeRuntimeStatus", nextAll);
        } catch (error) {
            Logger.warn(
                `[CodeRuntime] 持久化 ${engineId} 状态失败：${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return next;
    }

    #persistProgress(
        engineId: CodeRuntimeEngineId,
        phase: string,
        message: string,
        progress: number,
        force = false,
    ): CodeRuntimeEngineStatus {
        const last = this.#lastProgressPersist.get(engineId);
        const now = Date.now();
        const blocked =
            !force &&
            last !== undefined &&
            now - last.time < PROGRESS_PERSIST_INTERVAL_MS &&
            Math.abs(progress - last.percent) < 10;
        if (blocked) {
            return this.#readStatus(engineId);
        }
        this.#lastProgressPersist.set(engineId, { percent: progress, time: now });
        return this.#writeStatus(engineId, {
            state: "installing",
            phase,
            message,
            progress,
        });
    }

    #normalizeStaleStates(): void {
        const all = this.#readAllStatus();
        const now = Date.now();
        const next = { ...all.engines };
        let changed = false;

        for (const id of KNOWN_ENGINE_IDS) {
            const status = next[id];
            if (!status || status.state !== "installing") continue;
            next[id] = {
                ...status,
                state: "interrupted",
                lastError: status.lastError ?? "安装被中断（进程重启）。",
                lastCheckAt: now,
            };
            changed = true;
            Logger.warn(
                `[CodeRuntime] ${id} 重启前遗留 installing 状态，标记为 interrupted。`,
            );
        }

        if (!changed) return;
        try {
            stableConfig().set("codeRuntimeStatus", {
                engines: next,
                updatedAt: now,
            });
        } catch (error) {
            Logger.warn(
                `[CodeRuntime] 收敛 interrupted 状态失败：${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    // ---------- 状态查询 ----------

    getStates(): Record<string, CodeRuntimeEngineStatus> {
        const out: Record<string, CodeRuntimeEngineStatus> = {};
        for (const id of KNOWN_ENGINE_IDS) {
            out[id] = { ...this.#readStatus(id) };
        }
        return out;
    }

    getState(
        engineId: CodeRuntimeEngineId,
    ): CodeRuntimeEngineStatus | undefined {
        const all = stableConfig().get("codeRuntimeStatus");
        const s = all.engines?.[engineId];
        return s ? { ...s } : undefined;
    }

    // ---------- 工具执行入口 ----------

    async assertReady(engineId: CodeRuntimeEngineId): Promise<ReadyRuntime> {
        const handler = this.#getHandler(engineId);
        if (!handler) {
            throw new Error(`未知的代码运行时引擎：${engineId}`);
        }

        const exeRel = requiredRelPath(
            engineId,
            handler.getDefaultExecutableRelativePath(process.platform),
        );
        if (!exeRel) {
            throw new Error(
                `当前平台（${process.platform}）没有 [${engineId}] 的内置可执行文件约定，无法直接运行。`,
            );
        }

        const status = this.#readStatus(engineId);
        if (status.state === "ready" && status.installedRoot) {
            const exePath = join(status.installedRoot, exeRel);
            if (await pathExists(exePath)) {
                return {
                    engine: engineId,
                    executablePath: exePath,
                    rootDir: status.installedRoot,
                };
            }
            Logger.warn(
                `[CodeRuntime] ${engineId} 状态 ready 但可执行文件缺失：${exePath}；尝试磁盘自愈。`,
            );
        }

        const rootDir = codeRuntimeDir(engineId);
        const exePath = join(rootDir, exeRel);
        if (await pathExists(exePath)) {
            this.#writeStatus(engineId, {
                state: "ready",
                installedRoot: rootDir,
                lastError: undefined,
            });
            return {
                engine: engineId,
                executablePath: exePath,
                rootDir,
            };
        }

        const reason = status.lastError ? ` 上次错误：${status.lastError}` : "";
        throw new Error(
            `代码运行时 [${engineId}] 尚未就绪（状态：${status.state}）。${reason}`,
        );
    }

    // ---------- 工具注册 / 注销（内部闭环） ----------

    /**
     * **内部方法**：注册引擎工具。
     *
     * 由 `#ensureEngineNow` 在安装成功 / 已就绪路径自动调用，外部不应直接使用。
     * 内部检查 `#registeredTools` 与 config 启用状态，避免：
     *   - 重复注册；
     *   - 安装过程中用户已停用引擎导致的误注册。
     */
    async #registerEngineTool(
        engineId: CodeRuntimeEngineId,
        registerTool?: RegisterToolFn,
    ): Promise<void> {
        if (this.#registeredTools.has(engineId)) return;

        const cfg = stableConfig().get("codeRuntime");
        if (!cfg?.enabled || !cfg.engines?.[engineId]?.enabled) {
            Logger.log(
                `[CodeRuntime] ${engineId} 安装完成但用户已停用，跳过工具注册。`,
            );
            return;
        }

        const tool = await this.#loadEngineTool(engineId);
        const register =
            registerTool ??
            ((def: ToolDefinition<unknown, unknown>) =>
                globalToolDB.register(def));

        try {
            await register(tool);
            this.#registeredTools.set(engineId, tool.name);
            Logger.log(
                `[CodeRuntime] 工具 ${tool.name} 已注册（engine=${engineId}）。`,
            );
        } catch (error) {
            Logger.error(
                `[CodeRuntime] 注册工具 ${tool.name} 失败：${error instanceof Error ? error.message : String(error)
                }`,
            );
            throw error;
        }
    }

    /**
     * 停用引擎：从工具表中注销对应工具。
     *
     * 由 API 层在用户切换 `enabled = false` 时调用。运行时目录保留（不删除），
     * 再次启用时 `ensureEngine` 会通过 `assertReady` 直接复用。
     *
     * 幂等：未注册时是 no-op。
     *
     * `globalToolDB.unregister` 兼容 id 或 name；`#registry.get()` 的 name
     * 索引行为取决于具体实现，先按 name 试，未命中再按 builtinId 重试
     * （两个调用都是幂等的，代价可忽略）。
     */
    async disableEngine(engineId: CodeRuntimeEngineId): Promise<void> {
        const name = this.#registeredTools.get(engineId);
        if (!name) return;

        this.#registeredTools.delete(engineId);

        try {
            const removed = await globalToolDB.unregister(name);
            if (!removed) {
                await globalToolDB.unregister(builtinId(name));
            }
            Logger.log(
                `[CodeRuntime] 工具 ${name} 已注销（engine=${engineId}）。`,
            );
        } catch (error) {
            Logger.warn(
                `[CodeRuntime] 注销工具 ${name} 失败：${error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    // ---------- 安装入口 ----------

    async ensureEngine(
        engineId: CodeRuntimeEngineId,
        options?: EnsureEngineOptions,
    ): Promise<CodeRuntimeEngineStatus> {
        if (!isKnownEngine(engineId)) {
            throw new Error(`未知的代码运行时引擎：${engineId}`);
        }
        const existing = this.#inflight.get(engineId);
        if (existing) return existing;

        const promise = this.#enqueue(engineId, () =>
            this.#ensureEngineNow(engineId, options?.registerTool),
        ).finally(() => {
            this.#inflight.delete(engineId);
        });
        this.#inflight.set(engineId, promise);
        return promise;
    }

    #enqueue<T>(
        engineId: CodeRuntimeEngineId,
        job: () => Promise<T>,
    ): Promise<T> {
        const prev = this.#chains.get(engineId) ?? Promise.resolve();
        const next = prev.then(job, job);
        this.#chains.set(
            engineId,
            next.then(
                () => undefined,
                () => undefined,
            ),
        );
        return next;
    }

    #checkWindowsPathLength(
        rootDir: string,
        engineId: CodeRuntimeEngineId,
    ): void {
        if (process.platform !== "win32") return;
        if (rootDir.length <= WINDOWS_MAX_SAFE_PATH) return;

        Logger.warn(
            `[CodeRuntime] ${engineId} 安装路径较长（${rootDir.length} 字符），` +
            `可能触及 Windows MAX_PATH 限制（260）。建议将应用数据目录调整到更短路径。` +
            `路径：${rootDir}`,
        );

        const warningMessage =
            `${engineId} 安装路径较长（${rootDir.length} 字符），` +
            `可能触及 Windows 路径长度限制。若安装失败，请将应用数据目录调整到更短路径。`;
        report(
            taskIdOf(engineId),
            "preparing",
            warningMessage,
            5,
            [
                {
                    id: `code-runtime.${engineId}.long-path`,
                    level: "warn",
                    code: "code-runtime.long-path",
                    message: warningMessage,
                    detail: rootDir,
                    timestamp: Date.now(),
                },
            ],
        );
    }

    async #ensureEngineNow(
        engineId: CodeRuntimeEngineId,
        registerTool?: RegisterToolFn,
    ): Promise<CodeRuntimeEngineStatus> {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg?.enabled) {
            return this.#writeStatus(engineId, { state: "not_ready" });
        }
        const engineCfg: CodeRuntimeEngineConfig | undefined =
            cfg.engines?.[engineId];
        if (!engineCfg?.enabled) {
            return this.#writeStatus(engineId, { state: "not_ready" });
        }

        try {
            await this.assertReady(engineId);
            // 已就绪：确保工具已注册（覆盖进程重启后工具表被清空、但磁盘
            // 可执行文件仍在的自愈路径），然后直接返回。
            await this.#registerEngineTool(engineId, registerTool);
            return this.#readStatus(engineId);
        } catch {
            // 继续安装
        }

        const handler = this.#getHandler(engineId);
        if (!handler) {
            throw new Error(`未知的代码运行时引擎：${engineId}`);
        }

        const rootDir = codeRuntimeDir(engineId);
        const engineDownloadDir = codeRuntimeDownloadDir(engineId);
        const taskId = taskIdOf(engineId);

        this.#checkWindowsPathLength(rootDir, engineId);

        this.#writeStatus(engineId, {
            state: "installing",
            installedRoot: rootDir,
            phase: "preparing",
            message: `正在准备 ${engineId} 运行时...`,
            progress: 5,
            lastError: undefined,
            verifiedVersion: undefined,
        });
        report(taskId, "preparing", `正在准备 ${engineId} 运行时...`, 5);

        try {
            // 1. 确定候选 URL：用户自定义优先；否则引擎默认
            const defaultUrls = handler.getDefaultArchiveUrls(
                process.platform,
                process.arch,
            );
            const archiveUrls: string[] = engineCfg.archiveUrl
                ? [engineCfg.archiveUrl]
                : defaultUrls ?? [];

            if (archiveUrls.length === 0) {
                throw new Error(
                    `引擎 [${engineId}] 在当前平台（${process.platform}-${process.arch}）` +
                    `没有内置下载源，请配置 codeRuntime.engines.${engineId}.archiveUrl。`,
                );
            }

            const stripPrefix =
                engineCfg.extractStripPrefix ??
                handler.getDefaultExtractStripPrefix?.(
                    process.platform,
                    process.arch,
                ) ??
                "";

            const executableRel = requiredRelPath(
                engineId,
                engineCfg.executableRelativePath ??
                handler.getDefaultExecutableRelativePath(process.platform),
            );
            if (!executableRel) {
                throw new Error(
                    `引擎 [${engineId}] 缺少 executableRelativePath 配置（当前平台 ${process.platform}）。`,
                );
            }

            // 2. 下载前测速
            this.#persistProgress(
                engineId,
                "downloading",
                `正在测速并选择 ${engineId} 下载源...`,
                8,
                true,
            );
            report(
                taskId,
                "downloading",
                `正在测速并选择 ${engineId} 下载源...`,
                8,
            );

            const sortedUrls = archiveUrls.length > 1
                ? sortByLatency(
                    await probeUrls(archiveUrls, {
                        timeoutMs: DOWNLOAD_PROBE_TIMEOUT_MS,
                    }),
                )
                    .map((r) => r.url)
                    .filter((u) => Boolean(u))
                : archiveUrls;

            // 3. 下载（多源 failover）
            this.#persistProgress(
                engineId,
                "downloading",
                `正在下载 ${engineId} 运行时...`,
                10,
                true,
            );
            report(taskId, "downloading", `正在下载 ${engineId} 运行时...`, 10);

            const savePath = join(
                engineDownloadDir,
                deriveArchiveFilename(sortedUrls[0]!, ".zip"),
            );

            const sources = buildArchiveSources(handler, sortedUrls);
            let usedSourceLabel: string | undefined;
            await download({
                sources,
                savePath,
                skipExisting: true,
                parallelStreams: 3,
                onSourceChange: (source) => {
                    usedSourceLabel = source.label;
                },
                onProgress: (snap) => {
                    if (snap.percent <= 0) return;
                    const progress = 10 + Math.round(snap.percent * 0.45);
                    const message = `正在下载 ${engineId} ${snap.percent.toFixed(1)}%`;
                    this.#persistProgress(
                        engineId,
                        "downloading",
                        message,
                        progress,
                    );
                    report(taskId, "downloading", message, progress);
                },
            });
            if (usedSourceLabel) {
                Logger.log(
                    `[CodeRuntime] ${engineId} 归档下载源：${usedSourceLabel}`,
                );
            }

            // 4. SHA256 校验
            const expectedSha =
                engineCfg.archiveSha256?.toLowerCase() ??
                (!engineCfg.archiveUrl
                    ? handler
                        .getExpectedSha256?.(process.platform, process.arch)
                        ?.toLowerCase()
                    : undefined);

            if (expectedSha) {
                this.#persistProgress(
                    engineId,
                    "verifying",
                    `正在校验 ${engineId} 归档...`,
                    55,
                    true,
                );
                report(taskId, "verifying", `正在校验 ${engineId} 归档...`, 55);
                const actual = await sha256FileHex(savePath);
                if (actual !== expectedSha) {
                    throw new Error(
                        `[${engineId}] 归档 SHA256 不匹配：期望 ${expectedSha}，实际 ${actual}。`,
                    );
                }
            }

            // 5. 解压
            //
            // allowSymlinks 由引擎决定（Node.js Unix 需要；Windows zip
            // 内置真实 npm.cmd，无需）。默认 false 保持通用安全策略。
            // 通用解压器内部对符号链接有逃逸校验，与 node-tar 内置防护
            // 互补；了解这一点是理解"为何敢放开"的关键背景。
            this.#persistProgress(
                engineId,
                "extracting",
                `正在解压 ${engineId} 运行时...`,
                60,
                true,
            );
            report(taskId, "extracting", `正在解压 ${engineId} 运行时...`, 60);
            await clearDir(rootDir);
            const allowSymlinks =
                handler.getExtractAllowSymlinks?.(
                    process.platform,
                    process.arch,
                ) ?? false;
            await extractArchive({
                archivePath: savePath,
                targetDir: rootDir,
                stripPrefix,
                allowSymlinks,
            });

            // 6. 后处理
            const executablePath = join(rootDir, executableRel);
            if (!(await pathExists(executablePath))) {
                throw new Error(
                    `[${engineId}] 解压后未找到可执行文件：${executablePath}` +
                    `（extractStripPrefix 可能不正确）。`,
                );
            }
            if (handler.applyPostExtract) {
                this.#persistProgress(
                    engineId,
                    "post-processing",
                    `正在初始化 ${engineId} 环境...`,
                    75,
                    true,
                );
                report(
                    taskId,
                    "post-processing",
                    `正在初始化 ${engineId} 环境...`,
                    75,
                );
                await handler.applyPostExtract({
                    rootDir,
                    executablePath,
                    downloadDir: engineDownloadDir,
                    engineConfig: engineCfg,
                });
            }

            // 7. 验证
            this.#persistProgress(
                engineId,
                "verifying",
                `正在验证 ${engineId} 运行时...`,
                88,
                true,
            );
            report(taskId, "verifying", `正在验证 ${engineId} 运行时...`, 88);
            const version = await handler.verifyExecutable(executablePath, {});
            Logger.log(`[CodeRuntime] ${engineId} 就绪：${version}`);

            const doneStatus: CodeRuntimeEngineStatus = {
                state: "ready",
                installedRoot: rootDir,
                lastCheckAt: Date.now(),
                verifiedVersion: version,
                phase: undefined,
                message: undefined,
                progress: 100,
                lastError: undefined,
            };
            this.#writeStatus(engineId, doneStatus);

            // 8. 自动注册工具（内部闭环；用户若已在安装过程中停用则跳过）
            await this.#registerEngineTool(engineId, registerTool);

            complete(taskId, `${engineId} 运行时已就绪。`);
            return doneStatus;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            Logger.error(`[CodeRuntime] ${engineId} 初始化失败：${message}`);
            this.#writeStatus(engineId, {
                state: "failed",
                installedRoot: rootDir,
                lastError: message,
            });
            fail(taskId, `${engineId} 运行时初始化失败。`, message);
            throw error;
        }
    }

    // ---------- 启动编排 ----------

    async init(opts: CodeRuntimeInitOptions = {}): Promise<void> {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg?.enabled) {
            Logger.log("[CodeRuntime] 总开关未启用，跳过初始化。");
            return;
        }

        const registerTool: RegisterToolFn =
            opts.registerTool ??
            ((def: ToolDefinition<unknown, unknown>) =>
                globalToolDB.register(def));

        this.#normalizeStaleStates();

        const enabledIds = KNOWN_ENGINE_IDS.filter(
            (id) => isKnownEngine(id) && cfg.engines?.[id]?.enabled,
        );
        if (enabledIds.length === 0) {
            Logger.log(
                "[CodeRuntime] 总开关已启用，但没有启用具体引擎；跳过安装与工具注册。",
            );
            return;
        }

        let failureCount = 0;
        for (const id of enabledIds) {
            try {
                // 工具注册在 ensureEngine 内部自动完成。
                await this.ensureEngine(id, { registerTool });
            } catch (error) {
                failureCount += 1;
                const message =
                    error instanceof Error ? error.message : String(error);
                Logger.error(
                    `[CodeRuntime] ${id} 初始化失败，相关工具本次未注册：${message}`,
                );
            }
        }

        Logger.log(
            failureCount === 0
                ? "[CodeRuntime] 初始化完成。"
                : `[CodeRuntime] 初始化完成，${failureCount} 个引擎失败（详见各引擎日志）。`,
        );
    }

    async #loadEngineTool(
        id: CodeRuntimeEngineId,
    ): Promise<ToolDefinition<unknown, unknown>> {
        if (id === "python") {
            const mod = await import("./tools/python.js");
            return mod.pythonRunTool as ToolDefinition<unknown, unknown>;
        }
        if (id === "nodejs") {
            const mod = await import("./tools/nodejs.js");
            return mod.nodeRunTool as ToolDefinition<unknown, unknown>;
        }
        throw new Error(`未知的代码运行时引擎：${id}`);
    }
}

const KEY = Symbol.for("unigen.singleton.codeRuntimeManager");

export const codeRuntimeManager: CodeRuntimeManager = ((
    globalThis as unknown as Record<symbol, CodeRuntimeManager | undefined>
)[KEY] ??= new CodeRuntimeManager());