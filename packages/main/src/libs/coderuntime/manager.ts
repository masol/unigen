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
//     `archiveUrl` 时，回落到引擎给出的默认哈希；校验失败会删除坏归档，
//     避免 `skipExisting` 导致"永远校验失败"的死循环；
//   - **解压允许引擎定制**：`getExtractAllowSymlinks?.()` 控制 tar 归档
//     中符号链接的放行策略（默认 false，通用安全策略）；
//   - 每次状态跃迁点直接调用 `report / complete / fail`
//     （`$libs/utils/task-progress.js`），`id = "code-runtime:" + engineId`；
//   - **进度回调安全**：`report` / `complete` / `fail` 以及下载器的
//     `onProgress` / `onSourceChange` 全部包裹 try/catch。这些回调一旦
//     抛错会变成事件上下文里的未捕获异常，在 Node 15+ 默认
//     `--unhandled-rejections=throw` 下会直接拖垮主进程。
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

/**
 * 状态补丁。
 *
 * 使用 `null` 表示**显式清除**字段；`undefined`（不传）表示保留旧值。
 * 之前的实现用 `!== undefined` 判断，导致传 `undefined` 无法清除，
 * `phase / message / lastError / verifiedVersion` 会永久残留。
 */
type StatusPatch = {
    state?: CodeRuntimeEngineState;
    installedRoot?: string | null;
    lastError?: string | null;
    phase?: string | null;
    message?: string | null;
    progress?: number | null;
    verifiedVersion?: string | null;
};

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * 任务进度回调安全包装。
 *
 * 进度上报 / 完成 / 失败上报都不应该影响运行时安装本身；同时这些回调
 * 可能运行在下载器的事件上下文里，异常逃逸会产生未捕获 rejection。
 */
function safeReport(...args: Parameters<typeof report>): void {
    try {
        report(...args);
    } catch (error) {
        Logger.warn(`[CodeRuntime] 进度上报失败：${errorMessage(error)}`);
    }
}

function safeComplete(...args: Parameters<typeof complete>): void {
    try {
        complete(...args);
    } catch (error) {
        Logger.warn(`[CodeRuntime] 完成上报失败：${errorMessage(error)}`);
    }
}

function safeFail(...args: Parameters<typeof fail>): void {
    try {
        fail(...args);
    } catch (error) {
        Logger.warn(`[CodeRuntime] 失败上报失败：${errorMessage(error)}`);
    }
}

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
        patch: StatusPatch,
    ): CodeRuntimeEngineStatus {
        const current = this.#readStatus(engineId);
        const next: CodeRuntimeEngineStatus = {
            ...current,
            state: patch.state ?? current.state,
            lastCheckAt: Date.now(),
        };

        if (patch.installedRoot === null) delete next.installedRoot;
        else if (patch.installedRoot !== undefined) next.installedRoot = patch.installedRoot;

        if (patch.lastError === null) delete next.lastError;
        else if (patch.lastError !== undefined) next.lastError = patch.lastError;

        if (patch.phase === null) delete next.phase;
        else if (patch.phase !== undefined) next.phase = patch.phase;

        if (patch.message === null) delete next.message;
        else if (patch.message !== undefined) next.message = patch.message;

        if (patch.progress === null) delete next.progress;
        else if (patch.progress !== undefined) next.progress = patch.progress;

        if (patch.verifiedVersion === null) delete next.verifiedVersion;
        else if (patch.verifiedVersion !== undefined) {
            next.verifiedVersion = patch.verifiedVersion;
        }

        const all = this.#readAllStatus();
        const nextAll: CodeRuntimeStatus = {
            engines: { ...all.engines, [engineId]: next },
            updatedAt: Date.now(),
        };
        try {
            stableConfig().set("codeRuntimeStatus", nextAll);
        } catch (error) {
            Logger.warn(
                `[CodeRuntime] 持久化 ${engineId} 状态失败：${errorMessage(error)}`,
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
                `[CodeRuntime] 收敛 interrupted 状态失败：${errorMessage(error)}`,
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
                lastError: null,
                phase: null,
                message: null,
            });
            return {
                engine: engineId,
                executablePath: exePath,
                rootDir,
            };
        }

        // 记录 self-heal 失败：status 曾经是 ready 时必须纠正，否则 UI
        // 会长期显示 "ready" 而实际文件已丢失。仅在这个条件下写盘，
        // 避免工具调用在未安装场景下反复写配置。
        if (status.state === "ready") {
            this.#writeStatus(engineId, {
                state: "not_ready",
                installedRoot: null,
                phase: null,
                message: "运行时文件缺失，需要重新安装。",
                progress: null,
            });
        }

        const latest = this.#readStatus(engineId);
        const reason = latest.lastError ? ` 上次错误：${latest.lastError}` : "";
        throw new Error(
            `代码运行时 [${engineId}] 尚未就绪（状态：${latest.state}）。${reason}`,
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
     *
     * 注册失败时会 throw；调用方必须捕获并降级处理——注册失败只意味着
     * 工具不可用，**不**意味着运行时安装失败，不应触发重新下载。
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
                `[CodeRuntime] 注册工具 ${tool.name} 失败：${errorMessage(error)}`,
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
                `[CodeRuntime] 注销工具 ${name} 失败：${errorMessage(error)}`,
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
        safeReport(
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

        // ── 已就绪路径 ──
        //
        // `assertReady` 与工具注册必须分开 try/catch：此前二者共用同一个
        // catch，注册失败会被当成“未就绪”，从而意外触发完整的重新下载
        // 安装流程。注册失败仅意味着工具不可用，运行时本身仍然有效。
        let alreadyReady = false;
        try {
            await this.assertReady(engineId);
            alreadyReady = true;
        } catch {
            // 未就绪：继续安装流程。
        }

        if (alreadyReady) {
            try {
                await this.#registerEngineTool(engineId, registerTool);
            } catch (error) {
                Logger.error(
                    `[CodeRuntime] ${engineId} 已就绪，但工具注册失败：${errorMessage(error)}`,
                );
            }
            return this.#readStatus(engineId);
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
            lastError: null,
            verifiedVersion: null,
        });
        safeReport(taskId, "preparing", `正在准备 ${engineId} 运行时...`, 5);

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
            safeReport(
                taskId,
                "downloading",
                `正在测速并选择 ${engineId} 下载源...`,
                8,
            );

            // 测速只用于排序，不用于裁剪：不可达源保留在末尾作为兜底。
            // 测速结果不代表真实下载可用性（HEAD/GET 行为、镜像鉴权差异等），
            // 一旦把不可达源剔除，首个可达源后续失败时就没有 failover 列表了。
            let orderedUrls: string[] = [...archiveUrls];
            if (archiveUrls.length > 1) {
                try {
                    const probed = await probeUrls(archiveUrls, {
                        timeoutMs: DOWNLOAD_PROBE_TIMEOUT_MS,
                    });
                    const sorted = sortByLatency(probed);
                    const reachableCount = sorted.filter(
                        (r) => r.reachable && Boolean(r.url),
                    ).length;
                    const sortedUrls = sorted.map((r) => r.url);

                    if (sortedUrls.length > 0) {
                        orderedUrls = sortedUrls;
                    }

                    if (reachableCount === 0) {
                        Logger.warn(
                            `[CodeRuntime] ${engineId} 候选下载源测速均不可达，` +
                            `保留全部源并按配置顺序尝试。`,
                        );
                    } else if (reachableCount < sorted.length) {
                        Logger.warn(
                            `[CodeRuntime] ${engineId} 候选下载源 ${reachableCount}/${sorted.length} 可达；` +
                            `不可达源保留在末尾作为兜底。`,
                        );
                    }
                } catch (error) {
                    Logger.warn(
                        `[CodeRuntime] ${engineId} 下载源测速失败：${errorMessage(error)}；按配置顺序尝试。`,
                    );
                }
            }
            if (orderedUrls.length === 0) {
                throw new Error(`引擎 [${engineId}] 没有可用的下载源。`);
            }

            // 下载目录必须存在。
            //
            // ipull 在 `skipExisting` 检查 / 创建目标文件时会对目标路径
            // 做 `stat` / `open`；父目录不存在会抛 ENOENT，而 downloader
            // 会把它归类为“源失败”，导致一个本地文件系统问题被误报成
            // 所有下载源失败（Python 的 uv 只有一个国内源时会直接整体失败）。
            await fs.mkdir(engineDownloadDir, { recursive: true });

            // 3. 下载（多源 failover）
            this.#persistProgress(
                engineId,
                "downloading",
                `正在下载 ${engineId} 运行时...`,
                10,
                true,
            );
            safeReport(taskId, "downloading", `正在下载 ${engineId} 运行时...`, 10);

            const savePath = join(
                engineDownloadDir,
                deriveArchiveFilename(
                    orderedUrls[0]!,
                    process.platform === "win32" ? ".zip" : ".tar.gz",
                ),
            );

            const sources = buildArchiveSources(handler, orderedUrls);
            let usedSourceLabel: string | undefined;
            await download({
                sources,
                savePath,
                skipExisting: true,
                parallelStreams: 3,
                onSourceChange: (source) => {
                    try {
                        usedSourceLabel = source.label;
                    } catch {
                        // 仅日志用途，忽略。
                    }
                },
                onProgress: (snap) => {
                    // 回调运行在下载器的事件上下文中；异常逃逸会变成
                    // 未捕获 rejection，在 Node 15+ 默认
                    // `--unhandled-rejections=throw` 下直接拖垮主进程。
                    try {
                        const percent = snap?.percent;
                        if (
                            typeof percent !== "number" ||
                            !Number.isFinite(percent) ||
                            percent <= 0
                        ) {
                            return;
                        }
                        const clamped = Math.max(0, Math.min(100, percent));
                        const progress = 10 + Math.round(clamped * 0.45);
                        const message =
                            `正在下载 ${engineId} ${clamped.toFixed(1)}%`;
                        this.#persistProgress(
                            engineId,
                            "downloading",
                            message,
                            progress,
                        );
                        safeReport(taskId, "downloading", message, progress);
                    } catch (error) {
                        Logger.warn(
                            `[CodeRuntime] ${engineId} 下载进度回调异常：${errorMessage(error)}`,
                        );
                    }
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
                safeReport(taskId, "verifying", `正在校验 ${engineId} 归档...`, 55);
                const actual = await sha256FileHex(savePath);
                if (actual !== expectedSha) {
                    // 删除损坏归档：否则 `skipExisting: true` 会让下次
                    // ensure 继续复用同一份坏文件，形成“永远校验失败”
                    // 的死循环，且用户无法通过重试自愈。
                    await fs.unlink(savePath).catch(() => undefined);
                    throw new Error(
                        `[${engineId}] 归档 SHA256 不匹配：期望 ${expectedSha}，实际 ${actual}。` +
                        `已删除损坏归档，下次将重新下载。`,
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
            safeReport(taskId, "extracting", `正在解压 ${engineId} 运行时...`, 60);
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
                safeReport(
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
            safeReport(taskId, "verifying", `正在验证 ${engineId} 运行时...`, 88);
            const version = await handler.verifyExecutable(executablePath, {});
            Logger.log(`[CodeRuntime] ${engineId} 就绪：${version}`);

            this.#writeStatus(engineId, {
                state: "ready",
                installedRoot: rootDir,
                verifiedVersion: version,
                phase: null,
                message: null,
                progress: 100,
                lastError: null,
            });
            const doneStatus = this.#readStatus(engineId);

            // 8. 自动注册工具（内部闭环；用户若已在安装过程中停用则跳过）
            //
            // 注册失败降级为日志：运行时已经安装并验证通过，不应因为
            // 工具表注册异常而把状态标记为 failed（否则用户会看到
            // “安装失败”，但磁盘上一切正常）。
            try {
                await this.#registerEngineTool(engineId, registerTool);
            } catch (error) {
                Logger.error(
                    `[CodeRuntime] ${engineId} 安装成功，但工具注册失败：${errorMessage(error)}`,
                );
            }

            safeComplete(taskId, `${engineId} 运行时已就绪。`);
            return doneStatus;
        } catch (error) {
            const message = errorMessage(error);
            Logger.error(`[CodeRuntime] ${engineId} 初始化失败：${message}`);
            this.#writeStatus(engineId, {
                state: "failed",
                installedRoot: rootDir,
                lastError: message,
            });
            safeFail(taskId, `${engineId} 运行时初始化失败。`, message);
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
                Logger.error(
                    `[CodeRuntime] ${id} 初始化失败，相关工具本次未注册：${errorMessage(error)}`,
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