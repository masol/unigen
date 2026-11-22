// packages/main/src/libs/loader/downloader.ts
//
// 多源下载核心。设计目标：
//
//   - **下载 / 测速分离**：本模块**不做探测**；调用方若需要可先调用
//     `$libs/loader/probe.js` 的 `probeUrls / sortByLatency` 把候选 URL
//     排好序再传入 `sources`。`sources` 的顺序即尝试顺序。
//   - **后端多态**：
//       · `ipull`（默认）—— 纯 JS，单源并行分块下载；失败后自动 failover 到下一源；
//       · `aria2c` —— 需调用方**显式**指定（`backend: "aria2"` 或 `"auto"`），
//         检测到可用时跨源并行分块下载同一文件；
//         `auto` 在 aria2 失败时自动回退 ipull。
//   - **容错**：`failoverOnError = true`（默认）时，一个源失败会尝试下一个；
//     关闭时直接抛错，不做下一源尝试。
//   - **断点续传**：调用方使用稳定 `savePath` + `skipExisting = true`；
//     两个后端都以文件大小判定完整性（aria2 原生 `-c`，ipull `skipExisting`）。
//   - **取消**：AbortSignal 会向 aria2 子进程发送 SIGTERM，向 ipull 调 close()；
//     均不删除已下载文件（便于下次续传）。
//
// 已知限制：
//   - aria2 多源时的进度解析依赖其 console 输出格式（`[#gid xx% ]`）；
//     若未来 aria2 输出格式变化，进度会降级为 0，不影响下载本身；
//   - aria2 多源要求所有 URL 的 basename 一致（同文件名），否则会被视为
//     多个文件；本模块保证 `sources` 来自同一归档的不同镜像，basename 天然相同；
//   - ipull 的跨进程分块状态不持久化；只保证"文件大小一致则不重下 + 中断后
//     重新触发会重下未完成部分"。

import Logger from "electron-log/main.js";
import { execa } from "execa";
import { ensureDir } from "fs-extra";
import { downloadFile } from "ipull";
import { rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

export type DownloadBackend = "auto" | "ipull" | "aria2";

export interface DownloadProgressSnapshot {
    /** 已传输字节 */
    transferredBytes: number;
    /** 文件总字节；下载源未返回长度时为 0 */
    totalBytes: number;
    /** 0-100 */
    percent: number;
    /** 瞬时速度（字节/秒） */
    speedBytesPerSecond?: number;
    /** 预估剩余秒数 */
    etaSeconds?: number;
}

export interface DownloadSource {
    /** 实际下载 URL */
    url: string;
    /**
     * 可选标签；用于日志 / onSourceChange 回调识别
     * （例如 `china:ghproxy` / `official`）。
     */
    label?: string;
}

export interface DownloadOptions {
    /** 候选下载源（顺序即尝试顺序；调用方通常已按测速结果排序）。 */
    sources: DownloadSource[];
    savePath: string;
    /** 单源并行连接数；缺省 3。 */
    parallelStreams?: number;
    /**
     * 同大小文件跳过；缺省 true。
     * 这是「断点续传 / 结果缓存」的主要机制。
     */
    skipExisting?: boolean;
    /** 取消信号；Abort 时中断下载，不删除已下载文件 */
    signal?: AbortSignal;
    /** 进度回调；high-frequency，由调用方决定是否节流 */
    onProgress?: (snapshot: DownloadProgressSnapshot) => void;
    /** 当前尝试的源发生变化（i.e. 上一个失败 / 刚开始） */
    onSourceChange?: (source: DownloadSource, index: number) => void;
    /**
     * 单源失败后是否尝试下一个源。默认 true。
     * 置为 false 时只有首个源被使用；异常直接抛出。
     */
    failoverOnError?: boolean;
    /**
     * 后端选择。
     *   - `ipull`（默认）：纯 JS；不做 aria2 探测，行为最稳定；
     *   - `auto`：检测到 aria2c 时优先 aria2，失败时自动回退 ipull；
     *   - `aria2`：强制使用 aria2，不可用时抛错（调用方自行处理）。
     */
    backend?: DownloadBackend;
}

export interface DownloadResult {
    url: string;
    savePath: string;
    size: number;
    /** 是否命中已有文件（未重新下载） */
    reused: boolean;
    /** 实际使用的源 */
    source: DownloadSource;
    /** 实际使用的后端 */
    backend: "ipull" | "aria2";
}

// ─── aria2c 检测（进程级缓存） ─────────────────────────────────

let aria2cPathCache: string | null | undefined;

async function resolveAria2cPath(): Promise<string | null> {
    if (aria2cPathCache !== undefined) return aria2cPathCache;
    const finder = process.platform === "win32" ? "where" : "which";
    try {
        const result = await execa(finder, ["aria2c"], {
            reject: false,
            windowsHide: true,
        });
        if (result.exitCode === 0) {
            const first = (result.stdout ?? "")
                .split(/\r?\n/)
                .map((s) => s.trim())
                .find(Boolean);
            if (first) {
                aria2cPathCache = first;
                Logger.log(`[Downloader] aria2c 可用：${aria2cPathCache}`);
                return aria2cPathCache;
            }
        }
    } catch (err) {
        Logger.warn(
            `[Downloader] 检测 aria2c 失败：${err instanceof Error ? err.message : String(err)}`,
        );
    }
    aria2cPathCache = null;
    return null;
}

// ─── aria2 进度解析 ────────────────────────────────────────────

const SIZE_UNIT_MULT: Record<string, number> = {
    B: 1,
    KB: 1024,
    KIB: 1024,
    MB: 1024 ** 2,
    MIB: 1024 ** 2,
    GB: 1024 ** 3,
    GIB: 1024 ** 3,
    TB: 1024 ** 4,
    TIB: 1024 ** 4,
};

function parseSizeToken(value: string, unit: string): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const mult = SIZE_UNIT_MULT[unit.toUpperCase()] ?? 1;
    return Math.round(n * mult);
}

/**
 * 解析 aria2 的进度行。
 *
 * 典型格式（stderr，`--summary-interval=1`）：
 *   `[#2089b0 1.2MiB/34MiB(3%) CN:2 DL:1.1MiB ETA:29s]`
 */
function parseAria2Progress(line: string): DownloadProgressSnapshot | null {
    const mPercent = line.match(/\((\d+)%\)/);
    if (!mPercent) return null;
    const percent = Number(mPercent[1]);
    if (!Number.isFinite(percent)) return null;

    const mSize = line.match(
        /([\d.]+)\s*([KMGTP]?i?B)\s*\/\s*([\d.]+)\s*([KMGTP]?i?B)/i,
    );
    const transferredBytes = mSize ? parseSizeToken(mSize[1]!, mSize[2]!) : 0;
    const totalBytes = mSize ? parseSizeToken(mSize[3]!, mSize[4]!) : 0;

    const mSpeed = line.match(/DL:([\d.]+)\s*([KMGTP]?i?B)/i);
    const speed = mSpeed ? parseSizeToken(mSpeed[1]!, mSpeed[2]!) : undefined;

    const mEta = line.match(/ETA:(\d+)([smh])/i);
    let eta: number | undefined;
    if (mEta) {
        const n = Number(mEta[1]);
        const u = mEta[2]!.toLowerCase();
        eta = u === "s" ? n : u === "m" ? n * 60 : n * 3600;
    }

    return {
        transferredBytes,
        totalBytes,
        percent,
        speedBytesPerSecond: speed,
        etaSeconds: eta,
    };
}

// ─── aria2 后端 ────────────────────────────────────────────────

async function aria2Download(opts: DownloadOptions): Promise<DownloadResult> {
    const aria2c = await resolveAria2cPath();
    if (!aria2c) throw new Error("aria2c 不可达，无法使用 aria2 后端。");

    await ensureDir(dirname(opts.savePath));
    const existedBefore = await stat(opts.savePath)
        .then(() => true)
        .catch(() => false);

    if (existedBefore && (opts.skipExisting ?? true)) {
        const s = await stat(opts.savePath)
            .then((st) => st.size)
            .catch(() => 0);
        return {
            url: opts.sources[0]!.url,
            savePath: opts.savePath,
            size: s,
            reused: true,
            source: opts.sources[0]!,
            backend: "aria2",
        };
    }

    // 写 urls 列表：aria2 会把这些同 basename 的 URL 视为同一文件的多个源
    const urlsFile = join(
        tmpdir(),
        `unigen-aria2-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    );
    await writeFile(
        urlsFile,
        opts.sources.map((s) => s.url).join("\n") + "\n",
        "utf8",
    );

    const outDir = dirname(opts.savePath);
    const conns = String(Math.max(1, opts.parallelStreams ?? 3));

    // 注意：不指定 `-o`，由 aria2 用 URL 的 basename 作为文件名；
    // 因为我们保证所有 sources 的 basename 相同（同一归档不同镜像），
    // 若使用 `-o` 反而在部分 aria2 版本下会与 `-i` 冲突。
    const args = [
        "-i", urlsFile,
        "-d", outDir,
        "-x", conns,
        "-s", conns,
        "-j", "1",
        "-c",
        "--allow-overwrite=false",
        "--auto-file-renaming=false",
        "--summary-interval=1",
        "--console-log-level=notice",
        "--show-console-readout=false",
        "--enable-color=false",
        "--no-conf",
    ];

    Logger.log(
        `[Downloader] aria2 多源下载 ${opts.sources.length} 个源 → ${opts.savePath}`,
    );

    const subprocess = execa(aria2c, args, {
        reject: false,
        windowsHide: true,
    });

    let aborted = false;
    const onAbort = () => {
        aborted = true;
        if (typeof subprocess.pid === "number") {
            try {
                subprocess.kill("SIGTERM");
            } catch {
                /* ignore */
            }
        }
    };
    if (opts.signal) {
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    if (opts.onProgress) {
        const cb = opts.onProgress;
        let acc = "";
        const handleChunk = (chunk: Buffer | string) => {
            acc += typeof chunk === "string" ? chunk : chunk.toString("utf8");
            const lines = acc.split(/\r|\n/);
            acc = lines.pop() ?? "";
            for (const line of lines) {
                const snap = parseAria2Progress(line);
                if (!snap) continue;
                try {
                    cb(snap);
                } catch (err) {
                    Logger.warn(
                        `[Downloader] aria2 进度回调异常：${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            }
        };
        subprocess.stdout?.on("data", handleChunk);
        subprocess.stderr?.on("data", handleChunk);
    }

    let lastError: unknown;
    let succeeded = false;
    try {
        const result = await subprocess;
        if (aborted || opts.signal?.aborted) {
            throw new Error("下载已被取消");
        }
        if (result.exitCode !== 0) {
            throw new Error(
                `aria2c 退出码 ${result.exitCode}：${(result.stderr || result.stdout || "").trim() || "未知错误"}`,
            );
        }
        succeeded = true;
    } catch (err) {
        lastError = err;
    } finally {
        opts.signal?.removeEventListener("abort", onAbort);
        await rm(urlsFile, { force: true }).catch(() => undefined);
    }

    if (!succeeded) {
        if (lastError instanceof Error) throw lastError;
        throw new Error("aria2 下载失败。");
    }

    // aria2 期望的输出文件名 = URL basename；若与 savePath 不一致，重命名
    const actual = join(outDir, basename(new URL(opts.sources[0]!.url).pathname));
    let finalPath = opts.savePath;
    if (actual !== opts.savePath) {
        try {
            await stat(actual);
            await rm(opts.savePath, { force: true }).catch(() => undefined);
            await ensureDir(dirname(opts.savePath));
            await rename(actual, opts.savePath);
        } catch {
            finalPath = actual;
        }
    }

    const fileStat = await stat(finalPath).catch(() => null);
    if (!fileStat) {
        throw new Error(`aria2c 完成但未找到输出文件：${finalPath}`);
    }

    return {
        url: opts.sources[0]!.url,
        savePath: finalPath,
        size: fileStat.size,
        reused: existedBefore,
        source: opts.sources[0]!,
        backend: "aria2",
    };
}

// ─── ipull 后端 ────────────────────────────────────────────────

function readNumber(source: unknown, ...keys: string[]): number | undefined {
    if (!source || typeof source !== "object") return undefined;
    for (const key of keys) {
        const value = (source as Record<string, unknown>)[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
    }
    return undefined;
}

function extractIpullProgress(status: unknown): DownloadProgressSnapshot {
    const transferred =
        readNumber(status, "transferred", "transferredBytes", "bytesDownloaded") ?? 0;
    const total =
        readNumber(status, "total", "totalBytes", "size", "length") ?? 0;
    const rawPercent = readNumber(status, "percent", "progress");
    const percent =
        typeof rawPercent === "number"
            ? rawPercent
            : total > 0
                ? (transferred / total) * 100
                : 0;
    const speed = readNumber(status, "speed", "bytesPerSecond", "speedBytesPerSecond");
    const eta = readNumber(status, "timeLeft", "eta", "etaSeconds");
    return {
        transferredBytes: transferred,
        totalBytes: total,
        percent,
        speedBytesPerSecond: speed,
        etaSeconds: eta,
    };
}

async function ipullSingleSource(
    source: DownloadSource,
    opts: DownloadOptions,
    existedBefore: boolean,
): Promise<DownloadResult> {
    const downloader = await downloadFile({
        url: source.url,
        savePath: opts.savePath,
        parallelStreams: opts.parallelStreams ?? 3,
        skipExisting: opts.skipExisting ?? true,
        cliProgress: false,
        retry: { retries: 5 },
        retryFetchDownloadInfo: { retries: 3 },
    });

    const onAbort = () => {
        try {
            downloader.close();
        } catch (err) {
            Logger.warn(
                `[Downloader] 取消下载失败 ${source.url}：${err instanceof Error ? err.message : String(err)}`,
            );
        }
    };

    if (opts.signal) {
        if (opts.signal.aborted) {
            onAbort();
            throw new Error(`下载已被取消：${source.url}`);
        }
        opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    if (opts.onProgress) {
        const cb = opts.onProgress;
        downloader.on("progress", (status: unknown) => {
            try {
                cb(extractIpullProgress(status));
            } catch (err) {
                Logger.warn(
                    `[Downloader] 处理下载进度失败：${err instanceof Error ? err.message : String(err)}`,
                );
            }
        });
    }

    try {
        await downloader.download();
    } catch (err) {
        Logger.warn(
            `[Downloader] 下载失败 ${source.url} -> ${opts.savePath}：${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
    } finally {
        opts.signal?.removeEventListener("abort", onAbort);
    }

    const fileStat = await stat(opts.savePath);
    return {
        url: source.url,
        savePath: opts.savePath,
        size: fileStat.size,
        reused: existedBefore,
        source,
        backend: "ipull",
    };
}

async function ipullDownload(opts: DownloadOptions): Promise<DownloadResult> {
    await ensureDir(dirname(opts.savePath));

    const existedBefore = await stat(opts.savePath)
        .then(() => true)
        .catch(() => false);

    const failoverOnError = opts.failoverOnError ?? true;
    let lastError: unknown;

    for (let i = 0; i < opts.sources.length; i += 1) {
        const source = opts.sources[i]!;
        if (opts.signal?.aborted) {
            throw new Error(`下载已被取消：${source.url}`);
        }
        try {
            opts.onSourceChange?.(source, i);
            return await ipullSingleSource(source, opts, existedBefore);
        } catch (err) {
            lastError = err;
            if (opts.signal?.aborted) throw err;
            if (!failoverOnError) throw err;
            Logger.warn(
                `[Downloader] 源失败：${source.label ?? source.url}（${err instanceof Error ? err.message : String(err)}）；尝试下一个源（${i + 1}/${opts.sources.length}）。`,
            );
        }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error("所有下载源均失败。");
}

// ─── 统一入口 ──────────────────────────────────────────────────

/**
 * 多源下载主入口。
 *
 * 语义：
 *   - 默认后端为 **ipull**（行为最稳定，不依赖外部二进制）；
 *   - 指定 `backend: "auto"` 或 `"aria2"` 时才会探测 aria2c；
 *     `auto` 在 aria2 失败时自动回退 ipull，`aria2` 则直接抛错；
 *   - 调用方应先 `probeUrls + sortByLatency` 排好 `sources` 顺序；
 *     本函数不做路径探测，按 `sources` 顺序尝试（failover）。
 */
export async function download(opts: DownloadOptions): Promise<DownloadResult> {
    if (opts.sources.length === 0) {
        throw new Error("download: sources 为空。");
    }

    const backend = opts.backend ?? "ipull";
    const aria2 = (backend === "aria2" || backend === "auto")
        ? await resolveAria2cPath()
        : null;

    if (backend === "aria2" && !aria2) {
        throw new Error("download: 指定 aria2 后端但 aria2c 不可用。");
    }
    if (aria2) {
        try {
            return await aria2Download(opts);
        } catch (err) {
            if (backend === "aria2") throw err;
            Logger.warn(
                `[Downloader] aria2 失败，回退到 ipull：${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
    return ipullDownload(opts);
}