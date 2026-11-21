// packages/main/src/libs/coderuntime/manager.ts
//
// 代码运行时管理器：应用级单例。
//
// 职责：
//   - 读取 StableConfig 中 codeRuntime 配置；
//   - 按需下载 / 校验 / 解压 / 后处理 / 验证；
//   - 对外暴露 assertReady 给工具、ensureEngine 给 bootstrap；
//   - 维护**内存**状态机（不持久化）；进程重启后由磁盘存在性自我修复。
//
// 关键行为：
//   - 用户配置持久化在 StableConfig；运行时状态纯内存，避免崩溃后残留 installing；
//   - ensureEngine 串行；同一引擎并发调用共享进行中 Promise；
//   - 解压统一走 `archive.ts#extractArchive`（zip / tar 自动识别）；
//   - 下载缓存保存于 `runtime/code/_downloads/<engineId>/`，
//     借助 ipull 的 `skipExisting: true` 天然支持同尺寸续传/结果缓存；
//   - Windows MAX_PATH 长路径预警（uv 自身已处理 `\\?\`，但用户 userData
//     可能过深，需提前 alert 用户）。

import { extractArchive } from "$libs/loader/archive.js";
import { download } from "$libs/loader/downloader.js";
import { stableConfig } from "$libs/store/stable.js";
import {
    codeRuntimeDir,
    codeRuntimeDownloadDir,
} from "$libs/utils/sys/dir.js";
import type {
    CodeRuntimeEngineConfig,
    CodeRuntimeEngineId,
    CodeRuntimeEngineStatus,
} from "$types/appconfig.js";
import Logger from "electron-log/main.js";
import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { basename, join } from "node:path";
import {
    ENGINE_HANDLERS,
    isKnownEngine,
    KNOWN_ENGINE_IDS,
} from "./engines/index.js";
import type { EngineProgressReporter, ReadyRuntime } from "./types.js";

/** Windows MAX_PATH 260；预留 buffer，超过则预警。 */
const WINDOWS_MAX_SAFE_PATH = 200;

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

async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    for await (const chunk of stream) {
        hash.update(chunk as Buffer);
    }
    return hash.digest("hex").toLowerCase();
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

export class CodeRuntimeManager {
    /** 每引擎串行队列，避免安装/重装并发 */
    #chains = new Map<CodeRuntimeEngineId, Promise<unknown>>();
    /** 同一引擎正在进行的 ensure 复用 */
    #inflight = new Map<CodeRuntimeEngineId, Promise<CodeRuntimeEngineStatus>>();
    /** 内存态运行时状态（不持久化） */
    #states = new Map<CodeRuntimeEngineId, CodeRuntimeEngineStatus>();

    // ---------- 状态查询 ----------

    /** 返回全部引擎的状态快照（深拷贝，避免外部意外修改）。 */
    getStates(): Record<string, CodeRuntimeEngineStatus> {
        const out: Record<string, CodeRuntimeEngineStatus> = {};
        for (const id of KNOWN_ENGINE_IDS) {
            const s = this.#states.get(id);
            if (s) out[id] = { ...s };
        }
        return out;
    }

    getState(
        engineId: CodeRuntimeEngineId,
    ): CodeRuntimeEngineStatus | undefined {
        const s = this.#states.get(engineId);
        return s ? { ...s } : undefined;
    }

    #setState(
        engineId: CodeRuntimeEngineId,
        status: CodeRuntimeEngineStatus,
    ): void {
        this.#states.set(engineId, status);
    }

    // ---------- 工具执行入口 ----------

    /**
     * 工具执行入口：确认引擎就绪，返回可执行文件路径。
     *
     * 若内存状态缺失 / 失效，会尝试从磁盘推断（自我修复），
     * 从而在重启后无需重新下载即可恢复。
     */
    async assertReady(engineId: CodeRuntimeEngineId): Promise<ReadyRuntime> {
        const handler = ENGINE_HANDLERS[engineId];
        if (!handler) {
            throw new Error(`未知的代码运行时引擎：${engineId}`);
        }

        const exeRel = handler.getDefaultExecutableRelativePath(process.platform);
        if (!exeRel) {
            throw new Error(
                `当前平台（${process.platform}）没有 [${engineId}] 的内置可执行文件约定，无法直接运行。`,
            );
        }

        // 快速路径：内存状态 ready 且可执行文件仍在
        let status = this.#states.get(engineId);
        if (status?.state === "ready" && status.installedRoot) {
            const exePath = join(status.installedRoot, exeRel);
            if (await pathExists(exePath)) {
                return {
                    engine: engineId,
                    executablePath: exePath,
                    rootDir: status.installedRoot,
                };
            }
        }

        // 自我修复：磁盘上可执行文件存在则视为 ready（重启后无需重装）
        const rootDir = codeRuntimeDir(engineId);
        const exePath = join(rootDir, exeRel);
        if (await pathExists(exePath)) {
            status = {
                state: "ready",
                installedRoot: rootDir,
                lastCheckAt: Date.now(),
            };
            this.#setState(engineId, status);
            return {
                engine: engineId,
                executablePath: exePath,
                rootDir,
            };
        }

        const reason = status?.lastError ? ` 上次错误：${status.lastError}` : "";
        throw new Error(
            `代码运行时 [${engineId}] 尚未就绪（状态：${status?.state ?? "not_ready"
            }）。${reason}`,
        );
    }

    // ---------- 安装入口 ----------

    /**
     * 幂等安装某个引擎。
     * 并发调用同一引擎会复用进行中的 Promise。
     */
    async ensureEngine(
        engineId: CodeRuntimeEngineId,
        reporter?: EngineProgressReporter,
    ): Promise<CodeRuntimeEngineStatus> {
        if (!isKnownEngine(engineId)) {
            throw new Error(`未知的代码运行时引擎：${engineId}`);
        }
        const existing = this.#inflight.get(engineId);
        if (existing) return existing;

        const promise = this.#enqueue(engineId, () =>
            this.#ensureEngineNow(engineId, reporter),
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
        reporter?: EngineProgressReporter,
    ): void {
        if (process.platform !== "win32") return;
        if (rootDir.length <= WINDOWS_MAX_SAFE_PATH) return;

        Logger.warn(
            `[CodeRuntime] ${engineId} 安装路径较长（${rootDir.length} 字符），` +
            `可能触及 Windows MAX_PATH 限制（260）。建议将应用数据目录调整到更短路径。` +
            `路径：${rootDir}`,
        );
        reporter?.warn({
            id: `code-runtime.${engineId}.long-path`,
            level: "warn",
            code: "code-runtime.long-path",
            message:
                `${engineId} 安装路径较长（${rootDir.length} 字符），` +
                `可能触及 Windows 路径长度限制。若安装失败，请将应用数据目录调整到更短路径。`,
            detail: rootDir,
        });
    }

    async #ensureEngineNow(
        engineId: CodeRuntimeEngineId,
        reporter?: EngineProgressReporter,
    ): Promise<CodeRuntimeEngineStatus> {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg?.enabled) {
            const notReady: CodeRuntimeEngineStatus = { state: "not_ready" };
            this.#setState(engineId, notReady);
            return notReady;
        }
        const engineCfg: CodeRuntimeEngineConfig | undefined =
            cfg.engines?.[engineId];
        if (!engineCfg?.enabled) {
            const notReady: CodeRuntimeEngineStatus = { state: "not_ready" };
            this.#setState(engineId, notReady);
            return notReady;
        }

        // 快速路径：已经就绪（含自我修复）时不重复安装
        try {
            await this.assertReady(engineId);
            return this.#states.get(engineId)!;
        } catch {
            // 继续安装
        }

        const handler = ENGINE_HANDLERS[engineId];
        const rootDir = codeRuntimeDir(engineId);
        const downloadDir = codeRuntimeDownloadDir();
        const engineDownloadDir = codeRuntimeDownloadDir(engineId);

        this.#checkWindowsPathLength(rootDir, engineId, reporter);

        this.#setState(engineId, {
            state: "installing",
            installedRoot: rootDir,
            lastCheckAt: Date.now(),
        });
        reporter?.report("preparing", `正在准备 ${engineId} 运行时...`, 5);

        try {
            const archiveUrl =
                engineCfg.archiveUrl ??
                handler.getDefaultArchiveUrl(process.platform, process.arch);
            if (!archiveUrl) {
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

            const executableRel =
                engineCfg.executableRelativePath ??
                handler.getDefaultExecutableRelativePath(process.platform);
            if (!executableRel) {
                throw new Error(
                    `引擎 [${engineId}] 缺少 executableRelativePath 配置（当前平台 ${process.platform}）。`,
                );
            }

            // 1. 下载（skipExisting + 稳定文件名 → 天然续传/结果缓存）
            reporter?.report(
                "downloading",
                `正在下载 ${engineId} 运行时...`,
                10,
            );
            const savePath = join(
                engineDownloadDir,
                deriveArchiveFilename(archiveUrl, ".zip"),
            );
            await download({
                url: archiveUrl,
                savePath,
                skipExisting: true,
                parallelStreams: 3,
                onProgress: (snap) => {
                    if (snap.totalBytes > 0) {
                        const progress = 10 + Math.round(snap.percent * 0.45);
                        reporter?.report(
                            "downloading",
                            `正在下载 ${engineId} ${snap.percent.toFixed(1)}%`,
                            progress,
                        );
                    }
                },
            });

            // 2. 校验 SHA256
            if (engineCfg.archiveSha256) {
                reporter?.report(
                    "verifying",
                    `正在校验 ${engineId} 归档...`,
                    55,
                );
                const actual = await sha256File(savePath);
                const expected = engineCfg.archiveSha256.toLowerCase();
                if (actual !== expected) {
                    throw new Error(
                        `[${engineId}] 归档 SHA256 不匹配：期望 ${expected}，实际 ${actual}。`,
                    );
                }
            }

            // 3. 解压（统一走 archive.ts，按后缀自动选择 zip / tar）
            reporter?.report(
                "extracting",
                `正在解压 ${engineId} 运行时...`,
                60,
            );
            await clearDir(rootDir);
            await extractArchive({
                archivePath: savePath,
                targetDir: rootDir,
                stripPrefix,
            });

            // 4. 后处理
            const executablePath = join(rootDir, executableRel);
            if (!(await pathExists(executablePath))) {
                throw new Error(
                    `[${engineId}] 解压后未找到可执行文件：${executablePath}` +
                    `（extractStripPrefix 可能不正确）。`,
                );
            }
            if (handler.applyPostExtract) {
                reporter?.report(
                    "post-processing",
                    `正在初始化 ${engineId} 环境...`,
                    75,
                );
                await handler.applyPostExtract({
                    rootDir,
                    executablePath,
                    downloadDir,
                    engineConfig: engineCfg,
                });
            }

            // 5. 验证
            reporter?.report(
                "verifying",
                `正在验证 ${engineId} 运行时...`,
                88,
            );
            const version = await handler.verifyExecutable(
                executablePath,
                {},
            );
            Logger.log(`[CodeRuntime] ${engineId} 就绪：${version}`);

            const status: CodeRuntimeEngineStatus = {
                state: "ready",
                installedRoot: rootDir,
                lastCheckAt: Date.now(),
            };
            this.#setState(engineId, status);
            reporter?.report(
                "ready",
                `${engineId} 运行时已就绪。`,
                100,
            );
            return status;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            Logger.error(
                `[CodeRuntime] ${engineId} 初始化失败：${message}`,
            );
            this.#setState(engineId, {
                state: "failed",
                installedRoot: rootDir,
                lastError: message,
                lastCheckAt: Date.now(),
            });
            throw error;
        }
    }
}

const KEY = Symbol.for("unigen.singleton.codeRuntimeManager");

export const codeRuntimeManager: CodeRuntimeManager = ((
    globalThis as unknown as Record<symbol, CodeRuntimeManager | undefined>
)[KEY] ??= new CodeRuntimeManager());