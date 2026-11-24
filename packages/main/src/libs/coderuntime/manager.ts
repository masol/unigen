// packages/main/src/libs/coderuntime/manager.ts
//
// 代码运行时管理器：应用级单例。
//
// 职责边界（本次重构后）：
//   - **零私有状态**：所有引擎状态（含历史安装进度）持久化在 StableConfig，
//     由 `#readStatus / #writeStatus` 统一读写；
//   - **只保留瞬时调度状态**：`#chains` / `#inflight` / `#registeredTools` /
//     `#controllers` 是“每进程”的缓存，不参与持久化（进程退出即丢失，
//     符合语义）；
//   - **引擎实例化**：按 `engines/index.js` 的 `ENGINE_CLASSES` 在构造
//     函数里 `new`，不依赖模块级单例；
//   - `init()` 承担启动编排；依赖 `StableConfig` 与 `GlobalToolDB`；
//   - **工具注册/注销内部闭环**：`ensureEngine` 成功后自动注册；
//     `disableEngine` 负责注销；`#registerEngineTool` 永不暴露到外部；
//   - **系统运行时兜底**：平台没有内置下载源时，会调用引擎的
//     `detectSystemExecutable?()`（例如 Linux / macOS 上用户自行安装的
//     `aria2c`）；Windows 上的 aria2 则在托管安装 / 下载最终失败后回退
//     探测 PATH 中的 `aria2c.exe`。命中即视为 ready，**不下载、不解压**。
//     启用前由 `assertInstallable()` 提前拦截“内置源 / 自定义 archiveUrl /
//     系统运行时”三条来源都没有的平台；
//   - **可执行文件路径持久化**：状态里的 `executablePath` 是权威来源。
//     系统运行时的 `installedRoot` 只是「二进制所在目录」，靠
//     `installedRoot + executableRelativePath` 复算只有在二进制名与约定名
//     完全一致时成立；引擎一旦探测到别名（`aria2c-1.37` 之类），复算
//     就会落空。因此 `assertReady` 先用 `executablePath`，缺失时回落到
//     复算并**回填**，让旧状态自动完成迁移；
//   - **下载前测速**：manager 主动 `probeUrls + sortByLatency` 排序候选源；
//   - **下载后 SHA256 校验**：`archiveSha256` 配置优先；用户未自定义
//     `archiveUrl` 时，回落到引擎给出的默认哈希；校验失败会删除坏归档，
//     避免 `skipExisting` 导致“永远校验失败”的死循环；
//   - **解压允许引擎定制**：`getExtractAllowSymlinks?.()` 控制 tar 归档
//     中符号链接的放行策略（默认 false，通用安全策略）；
//   - **来源校验前移**：候选下载源为空时，在写 `installing` 状态之前就
//     失败，避免界面上先闪一段“安装中”，也避免 `failed` 状态上挂着
//     并不存在的 `installedRoot`；
//   - **可取消安装**：`#ensureEngineNow` 为每组安装创建一个
//     `AbortController`，并把 `signal` 透传给 `download` / `extractArchive`
//     / `applyPostExtract` / `verifyExecutable`；`disableEngine` 通过
//     `.abort()` 触发取消。取消路径会清理该引擎的下载目录，避免
//     `skipExisting` 复用不完整归档造成“永远 sha 不匹配”；
//   - **启停双向任务事件**：`ensureEngine`（安装 / 已就绪两条路径）与
//     `disableEngine` 都会发送 `code-runtime:<engineId>` 的终态事件。
//     renderer 的进度与工具列表刷新只订阅该事件，不再靠定时器猜测时机；
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
//
// 调用模式说明：
//   - `init()` 允许被调用方以 fire-and-forget 方式调度（如启动流程中不
//     阻塞主路径）。因此本类所有可能向外的失败点都必须在内部收敛，不能
//     让 `init()` 成为 rejection 源；客户端通过订阅独立 taskId
//     `code-runtime:<engineId>` 获知进度。

import { extractArchive } from "$libs/loader/archive.js";
import { download, type DownloadSource } from "$libs/loader/downloader.js";
import { sha256FileHex } from "$libs/loader/hash.js";
import { probeUrls, sortByLatency } from "$libs/loader/probe.js";
import { stableConfig } from "$libs/store/stable.js";
import { globalToolDB } from "$libs/tooldb/globaltooldb.js";
import { builtinId } from "$libs/tooldb/naming.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import { throwUnprocessable } from "$libs/utils/err.js";
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
import { basename, dirname, join } from "node:path";
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
    /** 入口可执行文件的完整路径；系统运行时可能不是约定的文件名。 */
    executablePath?: string | null;
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

/**
 * 在阶段过渡点主动检查取消信号。
 *
 * `download` / `extractArchive` / `execa #{cancelSignal}` 都会在自身
 * 生命周期内响应 abort；这里额外在**启动下一阶段之前**做一次显式检查，
 * 避免已经 abort 之后仍然去 spawn 新的子进程 / 打开新的写句柄造成浪费。
 */
function throwIfAborted(
    signal: AbortSignal,
    engineId: CodeRuntimeEngineId,
): void {
    if (!signal.aborted) return;
    const err = new Error(`[${engineId}] 安装已被取消。`);
    err.name = "AbortError";
    throw err;
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
 * `#chains`           ：单引擎串行队列（用于 ensureEngine 串行化）；
 * `#inflight`         ：ensure 复用（同一引擎进行中调用直接排队）；
 * `#registeredTools`  ：已注册工具名（engineId → tool.name），
 *                       与 `#chains` 一样是进程级缓存，不做持久化；
 * `#controllers`      ：**在安装期间的 AbortController**，供
 *                       `disableEngine` 触发取消；安装结束后从表中移除。
 */
export class CodeRuntimeManager {
    #engines: Map<CodeRuntimeEngineId, EngineRuntimeHandler>;
    #chains = new Map<CodeRuntimeEngineId, Promise<unknown>>();
    #inflight = new Map<CodeRuntimeEngineId, Promise<CodeRuntimeEngineStatus>>();
    #registeredTools = new Map<CodeRuntimeEngineId, string>();
    #controllers = new Map<CodeRuntimeEngineId, AbortController>();
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
        return all?.engines?.[engineId] ?? { state: "not_ready" };
    }

    #readAllStatus(): CodeRuntimeStatus {
        const all = stableConfig().get("codeRuntimeStatus");
        return {
            engines: { ...(all?.engines ?? {}) },
            updatedAt: all?.updatedAt ?? 0,
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

        if (patch.executablePath === null) delete next.executablePath;
        else if (patch.executablePath !== undefined) {
            next.executablePath = patch.executablePath;
        }

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
        const s = all?.engines?.[engineId];
        return s ? { ...s } : undefined;
    }

    /**
     * 当前平台是否有该引擎的内置下载源。
     *
     * 注意：`false` **不代表不可用** —— 引擎可能改用系统已安装的运行时
     * （见 `detectSystemExecutable`）。启用前的完整校验请用
     * `assertInstallable()`。
     */
    hasDefaultArchive(engineId: CodeRuntimeEngineId): boolean {
        const handler = this.#getHandler(engineId);
        return (
            handler?.hasDefaultArchive(process.platform, process.arch) ?? false
        );
    }

    // ---------- 系统运行时探测 ----------

    /**
     * 安全包装：探测系统已安装的运行时。
     *
     * 调用场景：`assertReady` 在无内置源 / 上次失败时；以及
     * `#ensureEngineNow` 在安装失败后的兜底路径。
     *
     * 失败（PATH 异常、引擎实现抛错等）一律降级为 null 并保留日志原因：
     * 探测失败的信息量远小于“把异常抛给不知情的调用方”。
     */
    async #detectSystemExecutable(
        engineId: CodeRuntimeEngineId,
    ): Promise<string | null> {
        const handler = this.#getHandler(engineId);
        if (!handler?.detectSystemExecutable) return null;
        try {
            const path = await handler.detectSystemExecutable();
            return typeof path === "string" && path.trim() ? path : null;
        } catch (error) {
            Logger.warn(
                `[CodeRuntime] 探测系统 ${engineId} 失败：${errorMessage(error)}`,
            );
            return null;
        }
    }

    /**
     * 验证系统运行时；失败时抛出**面向用户**的错误。
     *
     * 只在“从其它状态跃迁到系统运行时”的**第一次**执行：命中后 manager
     * 会把状态写成 `ready`，后续调用直接从状态快路径返回，不会每次工具
     * 调用都 spawn 一次 `--version`。
     */
    async #verifySystemExecutable(
        engineId: CodeRuntimeEngineId,
        handler: EngineRuntimeHandler,
        executablePath: string,
        signal?: AbortSignal,
    ): Promise<string> {
        try {
            const version = await handler.verifyExecutable(executablePath, {
                signal,
            });
            Logger.log(
                `[CodeRuntime] ${engineId} 使用系统已安装的运行时：` +
                `${executablePath}（${version}）`,
            );
            return version;
        } catch (error) {
            throwUnprocessable(
                `检测到系统安装的 ${engineId}（${executablePath}），但验证失败：` +
                `${errorMessage(error)}。请修复或重新安装后重试。`,
            );
        }
    }

    /**
     * 探测并验证系统运行时，成功后写入 ready 状态。
     *
     * 返回 null 表示未探测到系统运行时；探测到但验证失败会抛出面向
     * 用户的错误。调用方负责后续的工具注册与任务事件：
     *   - `assertReady` 只返回运行期上下文；
     *   - 安装失败后的兜底路径需要额外注册工具并发送终态事件。
     */
    async #resolveSystemRuntime(
        engineId: CodeRuntimeEngineId,
        handler: EngineRuntimeHandler,
        signal?: AbortSignal,
    ): Promise<ReadyRuntime | null> {
        const systemExe = await this.#detectSystemExecutable(engineId);
        if (!systemExe) return null;

        const systemRoot = dirname(systemExe);
        const version = await this.#verifySystemExecutable(
            engineId,
            handler,
            systemExe,
            signal,
        );
        this.#writeStatus(engineId, {
            state: "ready",
            installedRoot: systemRoot,
            executablePath: systemExe,
            verifiedVersion: version,
            lastError: null,
            phase: null,
            message: null,
            progress: 100,
        });
        return {
            engine: engineId,
            executablePath: systemExe,
            rootDir: systemRoot,
        };
    }

    /**
     * 启用前校验：确认当前平台具备可用的运行时来源。
     *
     * 判定顺序与运行期一致：
     *   1. 用户自定义 `archiveUrl`（交给下载器，不在此校验可达性）；
     *   2. 引擎内置下载源；
     *   3. 系统已安装的外部运行时（`detectSystemExecutable`）。
     *
     * 三者皆无时抛出面向用户的错误。放在“写配置之前”，是为了避免
     * 把 `enabled = true` 落盘后再异步失败，让界面长期停在 preparing。
     */
    async assertInstallable(engineId: CodeRuntimeEngineId): Promise<void> {
        const handler = this.#getHandler(engineId);
        if (!handler) {
            throw new Error(`未知的代码运行时引擎：${engineId}`);
        }

        const engineCfg = stableConfig().get("codeRuntime")?.engines?.[engineId];
        if (engineCfg?.archiveUrl?.trim()) return;
        if (handler.hasDefaultArchive(process.platform, process.arch)) return;
        if (await this.#detectSystemExecutable(engineId)) return;

        throw new Error(
            handler.getMissingRuntimeMessage?.() ??
            `引擎 [${engineId}] 在当前平台（${process.platform}-${process.arch}）` +
            `没有内置下载源，也没有检测到系统已安装的运行时。` +
            `请自行安装后重新启用，或在 codeRuntime.engines.${engineId}.archiveUrl ` +
            `配置自定义下载源。`,
        );
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

        // ── 1a. 持久化的完整可执行文件路径（权威来源） ──
        //
        // 系统运行时（Linux / macOS 的 aria2c）的 `installedRoot` 只是
        // 「二进制所在目录」，`installedRoot + exeRel` 只有在二进制名与
        // `executableRelativePath` 完全一致时才成立；引擎一旦探测到别名
        // （`aria2c-1.37`、`aria2c-x86_64` 之类），复算就会指向不存在的
        // 文件。因此显式记录的完整路径优先。
        if (status.state === "ready" && status.executablePath) {
            if (await pathExists(status.executablePath)) {
                return {
                    engine: engineId,
                    executablePath: status.executablePath,
                    rootDir:
                        status.installedRoot ??
                        dirname(status.executablePath),
                };
            }
            Logger.warn(
                `[CodeRuntime] ${engineId} 状态 ready 但可执行文件缺失：` +
                `${status.executablePath}；尝试磁盘自愈。`,
            );
        }

        // ── 1b. 托管安装（下载 / 解压 / 校验由 manager 完成） ──
        if (status.state === "ready" && status.installedRoot) {
            const exePath = join(status.installedRoot, exeRel);
            if (await pathExists(exePath)) {
                // 回填完整路径：旧状态没有 executablePath 时，在这里完成
                // 一次迁移，后续调用直接走上面更精确的分支。
                this.#writeStatus(engineId, { executablePath: exePath });
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
                executablePath: exePath,
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

        // ── 2. 系统已安装的运行时 ──
        //
        // 与托管安装的关系：**托管安装优先**（版本可控），这里是兜底。
        //
        // 探测条件：
        //   - 平台没有内置下载源，且用户没有自定义 archiveUrl
        //     （Linux / macOS 的 aria2 正常路径）；
        //   - 上次安装 / 下载失败（`failed` / `interrupted`）。
        //     Windows 上的 aria2 默认优先托管安装；下载失败后用户可能
        //     已经自行安装 aria2c，此时重新启用 / 工具调用应直接探测
        //     系统，避免重复下载。
        //
        // 命中后写回 ready（`installedRoot` 为二进制所在目录，
        // `executablePath` 为二进制完整路径），下一次调用直接走第 1a 步，
        // 不再重复探测。
        const engineCfg = stableConfig().get("codeRuntime")?.engines?.[engineId];
        const hasCustomArchive = Boolean(engineCfg?.archiveUrl?.trim());
        const hasDefaultArchive = handler.hasDefaultArchive(
            process.platform,
            process.arch,
        );
        if (
            status.state === "failed" ||
            status.state === "interrupted" ||
            (!hasCustomArchive && !hasDefaultArchive)
        ) {
            const systemRuntime = await this.#resolveSystemRuntime(
                engineId,
                handler,
            );
            if (systemRuntime) return systemRuntime;
        }

        // ── 3. 磁盘自愈失败：纠正陈旧的 ready 状态 ──
        //
        // 只在 status 曾经是 ready 时写盘，避免工具调用在未安装场景下
        // 反复写配置。系统运行时同样适用：用户卸载 aria2 后，状态会
        // 收敛为 not_ready，重新启用时会再次触发可用性校验。
        if (status.state === "ready") {
            this.#writeStatus(engineId, {
                state: "not_ready",
                installedRoot: null,
                executablePath: null,
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
        if (!cfg.engines?.[engineId]?.enabled) {
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
     * 停用引擎：中断进行中的安装（若存在），并从工具表中注销对应工具。
     *
     * 由 API 层在用户关闭 `enabled` 时调用。运行时目录保留（不删除），
     * 再次启用时 `ensureEngine` 会通过 `assertReady` 直接复用。
     *
     * 取消语义：
     *   - 若有进行中的安装，会先 `AbortSignal.abort()`，然后**等待**
     *     该安装 promise 落定；等待的目的是避免紧随其后的 re-enable
     *     通过 `#inflight` 命中已 abort 的旧 promise，造成“重新启用
     *     什么都不做”的假象；
     *   - 取消路径在 `#ensureEngineNow` 的 catch 里已经把状态收敛为
     *     `not_ready` 并发出了终态 task 事件；因此这里**不再**重复
     *     `#emitCompleted`，避免"用户取消"被显示成"已就绪"。
     *
     * 幂等：未注册工具 / 无正在安装任务时注销是 no-op，但仍会发送
     * 终态事件 —— renderer 以该事件收敛启停 UI（见 `CodeRuntimePanel`
     * 的 `$effect`），早期在这里提前 return 会让“未注册却要停用”的场景
     * 收不到任何事件，迫使界面只能用定时器猜注销时机。
     *
     * `globalToolDB.unregister` 兼容 id 或 name；`#registry.get()` 的 name
     * 索引行为取决于具体实现，先按 name 试，未命中再按 builtinId 重试
     * （两个调用都是幂等的，代价可忽略）。
     */
    async disableEngine(engineId: CodeRuntimeEngineId): Promise<void> {
        // 1. 若存在进行中的安装，先取消。
        let abortedInstall = false;
        const controller = this.#controllers.get(engineId);
        if (controller) {
            abortedInstall = true;
            this.#controllers.delete(engineId);
            controller.abort();
        }

        // 2. 等待安装 promise 落定。
        //
        // 即便没有 controller，也可能存在一个 very-recent "alreadyReady"
        // 快路径的 ensure 正在进行（不会创建 controller）；统一等待
        // inflight 保证 re-enable 时能看到干净的 #inflight 状态。
        const inflight = this.#inflight.get(engineId);
        if (inflight) {
            await inflight.catch(() => undefined);
        }

        // 3. 注销工具。
        const name = this.#registeredTools.get(engineId);
        if (name) {
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

        // 4. 终态事件。
        //
        // 若刚刚取消过安装，`#ensureEngineNow` 的 catch 已经发出
        // `safeFail`（任务已落定为 failed），UI 的 effect 会被这条事件
        // 触发；此时再发“已就绪”的 completed 会让界面短暂地从
        // "取消中" 切到 "已完成"，属于误导。因此这里分支：取消路径
        // 不再发 completed。
        if (!abortedInstall) {
            this.#emitCompleted(
                engineId,
                "preparing",
                `${engineId} 运行时已停用。`,
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

    /**
     * 终态事件（完成）。
     *
     * `ensureEngine` 的已就绪快路径与 `disableEngine` 都必须调用：
     * renderer 侧（`CodeRuntimePanel` 的 `$effect`）只在该任务的
     * `code-runtime:<engineId>` 进入终态后才重新拉取 `listRuntimes` 并刷新
     * 内建工具清单，进度 UI 完全由该事件驱动。
     *
     * 已就绪快路径尤其需要：系统运行时（Linux / macOS 上由
     * `detectSystemExecutable` 命中的 `aria2c`）没有任何下载 / 解压阶段
     * 可推送，不发终态事件界面会停在 `setRuntimeEnabled` 响应里的
     * “准备中”，必须离开设置页再回来才能恢复。
     *
     * 先补一条 100% 进度再收尾：进度上报同时负责在任务表中建立条目，
     * 避免 `complete` 依赖“任务条目已存在”这一隐含前提。
     */
    #emitCompleted(
        engineId: CodeRuntimeEngineId,
        phase: string,
        message: string,
    ): void {
        const taskId = taskIdOf(engineId);
        safeReport(taskId, phase, message, 100);
        safeComplete(taskId, message);
    }

    async #ensureEngineNow(
        engineId: CodeRuntimeEngineId,
        registerTool?: RegisterToolFn,
    ): Promise<CodeRuntimeEngineStatus> {
        const cfg = stableConfig().get("codeRuntime");
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
        //
        // 系统运行时（Linux / macOS 的 aria2c，以及 Windows 下载失败后
        // 回退成功的 aria2c）也走这条路径：`assertReady` 命中后这里直接
        // 注册工具返回，**不会**进入下面的下载流程。
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
            // 快路径没有下载 / 解压阶段，但 renderer 只依赖该任务的终态
            // 事件收敛进度 UI；缺少它会让界面停在“准备中”。
            this.#emitCompleted(
                engineId,
                "verifying",
                `${engineId} 运行时已就绪。`,
            );
            return this.#readStatus(engineId);
        }

        const handler = this.#getHandler(engineId);
        if (!handler) {
            throw new Error(`未知的代码运行时引擎：${engineId}`);
        }

        const rootDir = codeRuntimeDir(engineId);
        const engineDownloadDir = codeRuntimeDownloadDir(engineId);
        const taskId = taskIdOf(engineId);

        // ── 来源校验前移 ──
        //
        // 候选源为空时，此前会先写 `installing`（并带上 `installedRoot`）
        // 再失败：界面上先闪一段“安装中”，且 `failed` 状态挂着一个从未
        // 存在过的安装目录。把校验提到状态写入之前，失败路径只留下一条
        // 干净的 `failed` + `lastError`。
        //
        // 走到这里说明系统运行时探测同样没有命中（否则上面的
        // `assertReady` 已经返回）。错误文案交给引擎给出，最贴近该工具的
        // 实际安装方式。
        const defaultUrls = handler.getDefaultArchiveUrls(
            process.platform,
            process.arch,
        );
        const archiveUrls: string[] = engineCfg.archiveUrl
            ? [engineCfg.archiveUrl]
            : defaultUrls ?? [];

        if (archiveUrls.length === 0) {
            const message =
                handler.getMissingRuntimeMessage?.() ??
                `引擎 [${engineId}] 在当前平台（${process.platform}-${process.arch}）` +
                `没有内置下载源，请配置 codeRuntime.engines.${engineId}.archiveUrl。`;
            Logger.error(`[CodeRuntime] ${engineId} 无可用下载源：${message}`);
            this.#writeStatus(engineId, {
                state: "failed",
                installedRoot: null,
                executablePath: null,
                phase: null,
                message: null,
                progress: null,
                verifiedVersion: null,
                lastError: message,
            });
            safeFail(taskId, `${engineId} 运行时初始化失败。`, message);
            throw new Error(message);
        }

        this.#checkWindowsPathLength(rootDir, engineId);

        // ── 创建取消控制器 ──
        //
        // 放在校验之后的第一个副作用位置：若来源校验失败，用户还没有任何
        // 可取消的安装，避免创建后永远是孤儿。`#controllers` 允许
        // `disableEngine` 在任意阶段触发取消。
        const controller = new AbortController();
        const { signal } = controller;
        this.#controllers.set(engineId, controller);

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

            // 1. 下载前测速
            throwIfAborted(signal, engineId);
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
                        // 每源最长 8s；取消时没必要等测速窗口自然结束。
                        signal,
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
                // 防御：来源校验已前移，正常情况下不会到达。
                throw new Error(`引擎 [${engineId}] 没有可用的下载源。`);
            }

            // 下载目录必须存在。
            //
            // 下载器在 `skipExisting` 检查 / 打开目标文件时会对目标路径
            // 做 `stat` / `open`；父目录不存在会抛 ENOENT，而 downloader
            // 会把它归类为“源失败”，导致一个本地文件系统问题被误报成
            // 所有下载源失败（Python 的 uv 只有一个国内源时会直接整体失败）。
            await fs.mkdir(engineDownloadDir, { recursive: true });

            // 2. 下载（多源 failover）
            throwIfAborted(signal, engineId);
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
                isGithub: handler.isGithubArchive === true,
                signal,
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

            // 3. SHA256 校验
            throwIfAborted(signal, engineId);
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
                // 大归档（Node / Python 解释器等）的流式哈希耗时可观；
                // 把 AbortSignal 透传进去，取消时立即中断读取，而不是
                // 等整包算完才发现已经不需要了。
                const actual = await sha256FileHex(savePath, { signal });
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

            // 4. 解压
            //
            // allowSymlinks 由引擎决定（Node.js Unix 需要；Windows zip
            // 内置真实 npm.cmd，无需）。默认 false 保持通用安全策略。
            // 通用解压器内部对符号链接有逃逸校验，与 node-tar 内置防护
            // 互补；了解这一点是理解"为何敢放开"的关键背景。
            throwIfAborted(signal, engineId);
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
                signal,
            });

            // 5. 后处理
            throwIfAborted(signal, engineId);
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
                    signal,
                });
            }

            // 6. 验证
            throwIfAborted(signal, engineId);
            this.#persistProgress(
                engineId,
                "verifying",
                `正在验证 ${engineId} 运行时...`,
                88,
                true,
            );
            safeReport(taskId, "verifying", `正在验证 ${engineId} 运行时...`, 88);
            const version = await handler.verifyExecutable(executablePath, {
                signal,
            });
            Logger.log(`[CodeRuntime] ${engineId} 就绪：${version}`);

            this.#writeStatus(engineId, {
                state: "ready",
                installedRoot: rootDir,
                executablePath,
                verifiedVersion: version,
                phase: null,
                message: null,
                progress: 100,
                lastError: null,
            });
            const doneStatus = this.#readStatus(engineId);

            // 7. 自动注册工具（内部闭环；用户若已在安装过程中停用则跳过）
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
            // ── 取消路径 ──
            //
            // `signal.aborted` 为真说明：
            //   - `disableEngine` 主动触发了取消；或
            //   - 底层（下载器 / execa / 解压器）因取消而失败。
            // 两种情况下都应该收敛到用户可解释的状态，而不是把内部错误
            // 当作普通安装失败展示。
            if (signal.aborted) {
                Logger.log(`[CodeRuntime] ${engineId} 安装已被取消。`);
                // 清理残留的归档：`skipExisting: true` 会复用未完成文件
                // 导致下次 sha 校验必然失败。
                await clearDir(engineDownloadDir).catch((err: unknown) => {
                    Logger.warn(
                        `[CodeRuntime] 清理 ${engineId} 取消安装残留失败：${errorMessage(err)}`,
                    );
                });
                // 半解压目录同样必须清理。
                //
                // `assertReady` 的磁盘自愈分支只要看到
                // `rootDir/<executableRelativePath>` 存在，就会把状态直接
                // 改写成 ready（**不重新验证**）；保留半解压目录会让
                // "用户取消安装"在下次工具调用时被误判为安装完成，进而
                // 暴露一个缺文件 / 缺后处理产物（如 uv 托管的 Python
                // 解释器）的半成品运行时。
                await clearDir(rootDir).catch((err: unknown) => {
                    Logger.warn(
                        `[CodeRuntime] 清理 ${engineId} 取消安装残留目录失败：${errorMessage(err)}`,
                    );
                });
                this.#writeStatus(engineId, {
                    state: "not_ready",
                    installedRoot: null,
                    executablePath: null,
                    lastError: null,
                    phase: null,
                    message: null,
                    progress: null,
                    verifiedVersion: null,
                });
                safeFail(
                    taskId,
                    `${engineId} 安装已取消。`,
                    "用户取消了安装。",
                );
                // 不向调用方抛错：取消是预期内的终止，调用方（
                // `setRuntimeEnabled` 的 fire-and-forget catch）看到
                // AbortError 只会打印一条噪音日志，反而不利于排查。
                return this.#readStatus(engineId);
            }

            const originalMessage = errorMessage(error);
            Logger.error(`[CodeRuntime] ${engineId} 初始化失败：${originalMessage}`);

            // 安装 / 下载最终失败后，回退探测系统已安装的运行时。
            //
            // 典型场景：Windows 上的 aria2 默认走托管下载；网络不可达
            // 或归档校验失败时，用户可能已经通过包管理器安装了 aria2c。
            // 此时直接使用 PATH 中的二进制，而不是让整个运行时不可用。
            let fallbackError: string | undefined;
            try {
                const systemRuntime = await this.#resolveSystemRuntime(
                    engineId,
                    handler,
                    signal,
                );
                if (systemRuntime) {
                    try {
                        await this.#registerEngineTool(engineId, registerTool);
                    } catch (registerError) {
                        Logger.error(
                            `[CodeRuntime] ${engineId} 已回退到系统运行时，但工具注册失败：${errorMessage(registerError)}`,
                        );
                    }
                    this.#emitCompleted(
                        engineId,
                        "verifying",
                        `${engineId} 已回退到系统已安装的运行时。`,
                    );
                    return this.#readStatus(engineId);
                }
            } catch (fallbackException) {
                fallbackError = errorMessage(fallbackException);
                Logger.error(
                    `[CodeRuntime] ${engineId} 回退系统运行时失败：${fallbackError}`,
                );
            }

            const hint = handler.getMissingRuntimeMessage?.();
            const message = [
                originalMessage,
                fallbackError
                    ? `回退系统运行时失败：${fallbackError}`
                    : undefined,
                hint,
            ]
                .filter((part): part is string => Boolean(part))
                .join("\n");

            this.#writeStatus(engineId, {
                state: "failed",
                installedRoot: rootDir,
                executablePath: null,
                lastError: message,
            });
            safeFail(taskId, `${engineId} 运行时初始化失败。`, message);
            return throwUnprocessable(message);
        } finally {
            // 清理本次安装的瞬时资源：
            //   - controller：只有自己还是当前 controller 时才删除，避免
            //     去删一条本属于后续 ensure 的 controller（正常流程
            //     不会发生，属于防御性写法）；
            //   - 进度节流表：无论成功 / 失败 / 取消，缓存都是脏的，
            //     下一次 ensure 应重新计时。
            if (this.#controllers.get(engineId) === controller) {
                this.#controllers.delete(engineId);
            }
            this.#lastProgressPersist.delete(engineId);
        }
    }

    // ---------- 启动编排 ----------

    /**
     * 启动编排。
     *
     * **调用方可 fire-and-forget 调度**（如启动流程中不阻塞主路径）：
     * 因此即使内部完全失败也不向外抛错，只记录日志。所有对外可见的
     * 失败信息通过 `report / fail`（taskId = `code-runtime:<engineId>`）
     * 与 `getState()`（StableConfig 快照）广播。
     */
    async init(opts: CodeRuntimeInitOptions = {}): Promise<void> {
        try {
            this.#normalizeStaleStates();

            const cfg = stableConfig().get("codeRuntime");
            const enabledIds = KNOWN_ENGINE_IDS.filter(
                (id) => isKnownEngine(id) && cfg.engines?.[id]?.enabled,
            );
            if (enabledIds.length === 0) {
                Logger.log(
                    "[CodeRuntime] 没有启用任何引擎；跳过安装与工具注册。",
                );
                return;
            }

            const registerTool: RegisterToolFn =
                opts.registerTool ??
                ((def: ToolDefinition<unknown, unknown>) =>
                    globalToolDB.register(def));

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
        } catch (error) {
            // 兜底：本方法以 fire-and-forget 被启动流程调度，未向外抛错。
            // 正常路径下所有可能失败点都已在内部 try/catch 处理；这里只
            // 处理配置读取异常、未来新增代码遗漏等边缘情况，防止产生
            // unhandled rejection 拖垮主进程。
            Logger.error(
                `[CodeRuntime] 初始化编排失败（已兜底，不影响启动）：${errorMessage(error)}`,
            );
        }
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
        if (id === "aria2") {
            const mod = await import("./tools/aria2.js");
            return mod.aria2DownloadTool as ToolDefinition<unknown, unknown>;
        }
        throw new Error(`未知的代码运行时引擎：${id}`);
    }
}

const KEY = Symbol.for("unigen.singleton.codeRuntimeManager");

export const codeRuntimeManager: CodeRuntimeManager = ((
    globalThis as unknown as Record<symbol, CodeRuntimeManager | undefined>
)[KEY] ??= new CodeRuntimeManager());