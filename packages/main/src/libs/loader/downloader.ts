// packages/main/src/libs/loader/downloader.ts
//
// 通用下载能力，封装 ipull。被「代码运行时」等长任务复用，不依赖业务。
//
// 关注点：
//   - 进度回调：由调用方决定是否再转派给 broadcast；
//   - 断点续传：调用方使用稳定 savePath + skipExisting=true，
//     ipull 以文件大小判定完整性；相同大小视为完成，不匹配则重新下载；
//   - 取消：通过 AbortSignal 调 close()（保留已下载文件，便于下次续传）；
//   - SHA256 校验、大小统计：由调用方基于 savePath 做后续处理。
//
// 已知限制（明确记录，避免误用）：
//   - ipull 的「跨进程断点续传」依赖文件未损坏；目前只保证：
//       1) 相同 size 的完整文件不被重复下载；
//       2) 中断后重新触发的 download 会重下未完成部分；
//     「分块状态持久化」能力未做二次封装，需要时再扩展。

import Logger from "electron-log/main.js";
import { ensureDir } from "fs-extra";
import { downloadFile } from "ipull";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";

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

export interface DownloadOptions {
    url: string;
    savePath: string;
    /** 并行连接数；缺省 3 */
    parallelStreams?: number;
    /**
     * 相同大小文件跳过；缺省 true。
     * 这是「断点续传/结果缓存」的主要机制。
     */
    skipExisting?: boolean;
    /** 取消信号；Abort 时调 close()，不会删除已下载部分 */
    signal?: AbortSignal;
    /** 进度回调；high-frequency，由调用方决定是否节流 */
    onProgress?: (snapshot: DownloadProgressSnapshot) => void;
}

export interface DownloadResult {
    url: string;
    savePath: string;
    size: number;
    /** 是否命中已有文件（未重新下载） */
    reused: boolean;
}

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

/** 兼容多种字段名，对 ipull 的 FormattedStatus 做防御性读取。 */
function extractProgress(status: unknown): DownloadProgressSnapshot {
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

export async function download(opts: DownloadOptions): Promise<DownloadResult> {
    await ensureDir(dirname(opts.savePath));

    const existedBefore = await stat(opts.savePath)
        .then(() => true)
        .catch(() => false);

    const downloader = await downloadFile({
        url: opts.url,
        savePath: opts.savePath,
        parallelStreams: opts.parallelStreams ?? 3,
        skipExisting: opts.skipExisting ?? true,
        cliProgress: false,
        retry: { retries: 5 },
        retryFetchDownloadInfo: { retries: 3 },
    });

    const onAbort = () => {
        try {
            // close 保留已下载文件，便于下次 skipExisting 命中或整体重下
            downloader.close();
        } catch (error) {
            Logger.warn(
                `[Downloader] 取消下载失败 ${opts.url}: ${error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    };

    if (opts.signal) {
        if (opts.signal.aborted) {
            onAbort();
            throw new Error(`下载已被取消：${opts.url}`);
        }
        opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    if (opts.onProgress) {
        const onProgress = opts.onProgress;
        downloader.on("progress", (status: unknown) => {
            try {
                onProgress(extractProgress(status));
            } catch (error) {
                Logger.warn(
                    `[Downloader] 处理下载进度失败: ${error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        });
    }

    try {
        await downloader.download();
    } catch (error) {
        Logger.warn(
            `[Downloader] 下载失败 ${opts.url} -> ${opts.savePath}: ${error instanceof Error ? error.message : String(error)
            }`,
        );
        throw error;
    } finally {
        opts.signal?.removeEventListener("abort", onAbort);
    }

    const fileStat = await stat(opts.savePath);
    return {
        url: opts.url,
        savePath: opts.savePath,
        size: fileStat.size,
        reused: existedBefore,
    };
}