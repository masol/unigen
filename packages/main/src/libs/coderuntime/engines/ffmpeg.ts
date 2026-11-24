// packages/main/src/libs/coderuntime/engines/ffmpeg.ts
//
// FFmpeg 运行时引擎。
//
// 与 aria2 类似：没有官方便携二进制，托管安装使用社区构建。但比 aria2
// 多一层麻烦 —— 不同构建的**目录布局不同**：
//
//   - Jellyfin 便携构建：解压后 `ffmpeg` / `ffmpeg.exe` 平铺在归档根目录；
//   - npm 镜像上的 ffmpeg-builds：二进制埋在二级目录里（层级由构建脚本
//     决定，不是稳定的固定前缀）。
//
// 因此本引擎：
//   - **不声明** `extractStripPrefix`：剥离前缀会破坏其中一种布局，
//     而 stripPrefix 只能表达一种；
//   - 实现 `locateExecutable`：解压后递归定位 `ffmpeg(.exe)`，取**层级
//     最浅**的那个。manager 会先按约定路径检查，未命中才调用本方法，
//     所以 Jellyfin 布局不会产生额外扫描开销；
//   - 实现 `applyPostExtract`：在 POSIX 上补齐 `ffmpeg` 与 `ffprobe` 的
//     可执行位（tar 通常保留、zip 不携带 mode，补齐是廉价保险，失败只
//     warn，由后续 verify 暴露）。
//
// 三层可用性来源（与 aria2 一致）：
//   1. 托管安装（下载 → 解压 → 定位 → 验证）；
//   2. 托管安装 / 下载失败后，回退探测系统已安装的 `ffmpeg`；
//   3. 平台没有内置源且探测不到时，提示用户自行安装
//      （`getMissingRuntimeMessage`）。
//
// 【关于 ffprobe】
// 两类构建都附带 `ffprobe`，且与 `ffmpeg` 同目录。工具层的 `probe_media`
// 需要它，因此这里导出 `resolveFfprobeCommand()`：先查同目录（覆盖
// 托管安装的平铺 / 嵌套两种布局），未命中再回退 PATH（部分发行版把
// ffmpeg 与 ffprobe 拆成不同包）。解析逻辑放在引擎层、与
// `engines/nodejs.ts` 的 `resolveNpmCommand()` 同一模式，避免工具层重复
// 实现路径推导。

import { stableConfig } from "$libs/store/stable.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { EngineRuntimeHandler, PostExtractContext } from "../types.js";
import {
    FFMPEG_DIST_BASE,
    FFMPEG_VERSION,
    resolveFfmpegAsset,
} from "./ffmpeg.reg.js";
import { findSystemExecutable } from "./system.js";

/**
 * 定位扫描的最大深度。
 *
 * 已知布局最多 2~3 层（`<root>/<build-dir>/bin/ffmpeg`）；4 层已足够覆盖
 * 未来布局微调，同时避免异常归档把安装卡在大目录遍历上。
 */
const MAX_LOCATE_DEPTH = 4;

/** 定位扫描的最大条目数（防御性上限，正常归档远低于此值）。 */
const MAX_LOCATE_ENTRIES = 20_000;

/** 与 ffmpeg 同目录的探查二进制名；按平台区分扩展名。 */
const FFPROBE_BINARY_NAME = process.platform === "win32"
    ? "ffprobe.exe"
    : "ffprobe";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function pathExists(target: string): Promise<boolean> {
    return fs.access(target).then(() => true, () => false);
}

/**
 * 在归档解压目录内**广度优先**查找入口可执行文件。
 *
 * 为什么用 BFS 而不是 DFS：同一份归档可能存在多个同名候选（例如同时
 * 打包了 `ffmpeg` 与某个测试副本），BFS 保证拿到**层级最浅**的那个，
 * 也就是最可能是正式入口的那个；同层内按名称字典序，保证多次安装结果
 * 可复现。
 *
 * 为什么不用 fast-glob：本函数只做一次、目标单一、且必须受深度 / 条目数
 * 上限与 `AbortSignal` 约束；自带实现避免为一个工具引入额外依赖，
 * 也避免 glob 在大目录上产生不可控的遍历。
 */
async function findBinaryInTree(
    rootDir: string,
    binaryName: string,
    signal?: AbortSignal,
): Promise<string | null> {
    const expected = process.platform === "win32"
        ? binaryName.toLowerCase()
        : binaryName;

    let visited = 0;
    let level: string[] = [rootDir];

    for (
        let depth = 0;
        depth <= MAX_LOCATE_DEPTH && level.length > 0;
        depth += 1
    ) {
        const nextLevel: string[] = [];

        for (const dir of level) {
            if (signal?.aborted) return null;

            let entries;
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch (error) {
                // 单个目录读失败（权限 / 竞态）不应中断整体定位。
                Logger.warn(
                    `[CodeRuntime] 定位 ffmpeg 时无法读取 ${dir}：${errorMessage(error)}`,
                );
                continue;
            }

            entries.sort((a, b) => a.name.localeCompare(b.name));

            for (const entry of entries) {
                visited += 1;
                if (visited > MAX_LOCATE_ENTRIES) {
                    Logger.warn(
                        `[CodeRuntime] 定位 ${binaryName} 已扫描 ${MAX_LOCATE_ENTRIES} 个条目，放弃扫描。`,
                    );
                    return null;
                }

                const fullPath = join(dir, entry.name);

                if (entry.isFile()) {
                    const name = process.platform === "win32"
                        ? entry.name.toLowerCase()
                        : entry.name;
                    if (name === expected) return fullPath;
                    continue;
                }

                if (entry.isDirectory() && depth < MAX_LOCATE_DEPTH) {
                    nextLevel.push(fullPath);
                }
            }
        }

        level = nextLevel;
    }

    return null;
}

/**
 * ffprobe 解析缓存：ffmpeg 可执行文件路径 → 解析结果（Promise）。
 *
 * 为什么缓存 Promise 而不是结果：
 *   - `probe_media` 可能被并发调用，缓存 Promise 天然合并并发探测，
 *     避免同时扫多遍 PATH；
 *   - 命中 `null` 也会被缓存 —— 若用户之后手动装了 ffprobe，需要重启
 *     应用才生效。这与本文件其余“一次安装、长期复用”的语义一致，
 *     也避免每次失败都重新扫 PATH 刷日志。
 */
const FFPROBE_CACHE = new Map<string, Promise<string | null>>();

/**
 * 解析 `ffprobe` 可执行文件。
 *
 * 优先级：
 *   1. `ffmpeg` **同目录**的 `ffprobe(.exe)` —— 覆盖托管构建
 *      （Jellyfin 平铺、npm 嵌套两种布局都在同一目录内成对出现）；
 *   2. 系统 PATH —— 部分发行版把 `ffmpeg` / `ffprobe` 拆成不同包，
 *      或用户自行安装时只把其中一个放进了 PATH。
 *
 * 返回 `null` 表示两者都未命中；调用方（`probe_media`）负责给出面向
 * 用户的错误文案，不在此抛错。
 */
export async function resolveFfprobeCommand(
    ffmpegExecutablePath: string,
): Promise<string | null> {
    const cached = FFPROBE_CACHE.get(ffmpegExecutablePath);
    if (cached) return cached;

    const task = (async (): Promise<string | null> => {
        const sibling = join(
            dirname(ffmpegExecutablePath),
            FFPROBE_BINARY_NAME,
        );
        if (await pathExists(sibling)) {
            return sibling;
        }

        Logger.log(
            `[CodeRuntime] ffmpeg 同目录未找到 ${FFPROBE_BINARY_NAME}，回退探测系统 PATH。`,
        );
        return findSystemExecutable({
            binaryNames: [FFPROBE_BINARY_NAME],
            logLabel: "ffprobe",
        });
    })().catch((error: unknown) => {
        Logger.warn(
            `[CodeRuntime] 解析 ffprobe 失败：${errorMessage(error)}`,
        );
        return null;
    });

    FFPROBE_CACHE.set(ffmpegExecutablePath, task);
    return task;
}

export class FfmpegRuntime implements EngineRuntimeHandler {
    readonly id = "ffmpeg" as const;

    /**
     * 托管下载源来自 Jellyfin 文件仓库 / npmmirror CDN，都不是 GitHub
     * Release，因此不启用 GitHub 代理注入（`isGithubArchive` 保持缺省）。
     */
    hasDefaultArchive(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): boolean {
        return resolveFfmpegAsset(platform, arch) != null;
    }

    /**
     * 探测系统已安装的 ffmpeg。
     *
     * 探测顺序：PATH 各目录 → 通用常见目录（仅 POSIX，见 system.ts）。
     * 不做版本验证：manager 拿到路径后会调用 `verifyExecutable()`，
     * 避免同一动作重复 spawn。
     */
    async detectSystemExecutable(): Promise<string | null> {
        return findSystemExecutable({
            binaryNames: process.platform === "win32" ? ["ffmpeg.exe"] : ["ffmpeg"],
            logLabel: "ffmpeg",
        });
    }

    getMissingRuntimeMessage(): string {
        if (process.platform === "win32") {
            return (
                `未检测到可用的系统 ffmpeg（或系统版本验证失败）。` +
                `请自行安装 ffmpeg 并将其所在目录加入 PATH 后重新启用或重试，` +
                `也可以在 codeRuntime.engines.ffmpeg.archiveUrl 配置自定义下载源。`
            );
        }
        return (
            `未检测到系统安装的 ffmpeg，无法启用音视频处理工具。` +
            `请先自行安装 ffmpeg 后重新启用：` +
            `macOS 可执行 brew install ffmpeg，` +
            `Debian/Ubuntu 可执行 apt install ffmpeg，` +
            `Fedora 可执行 dnf install ffmpeg，` +
            `Arch 可执行 pacman -S ffmpeg。` +
            `安装完成后重新启用即可，会直接使用系统中的 ffmpeg。`
        );
    }

    getDefaultArchiveUrls(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string[] | undefined {
        const asset = resolveFfmpegAsset(platform, arch);
        if (!asset) return undefined;

        const inChina = stableConfig().get("isChina");
        const jellyfinBase = inChina
            ? FFMPEG_DIST_BASE.jellyfinChina
            : FFMPEG_DIST_BASE.jellyfinOfficial;

        // 两类构建的路径规则不同，这里直接给**完整 URL**：
        //   1) Jellyfin 便携构建（体积小、国内镜像快）为主源；
        //   2) npm 镜像上的 ffmpeg-builds 为备源（主源 404 / 不可达时兜底）。
        const urls: string[] = [`${jellyfinBase}/${asset.jellyfinPath}`];
        if (asset.npmPath) {
            urls.push(`${FFMPEG_DIST_BASE.npmMirror}/${asset.npmPath}`);
        }
        return urls;
    }

    getDefaultExecutableRelativePath(
        platform: NodeJS.Platform,
    ): string | undefined {
        return platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    }

    /**
     * 解压后定位入口。
     *
     * 只在“约定路径未命中”时被 manager 调用（见 `EngineRuntimeHandler`
     * 的 `locateExecutable` 注释），用于处理嵌套布局。
     */
    async locateExecutable(ctx: {
        rootDir: string;
        signal?: AbortSignal;
    }): Promise<string | null> {
        const asset = resolveFfmpegAsset(process.platform, process.arch);
        const binaryName =
            asset?.binaryName ??
            (process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

        const located = await findBinaryInTree(
            ctx.rootDir,
            binaryName,
            ctx.signal,
        );
        if (!located) {
            Logger.warn(
                `[CodeRuntime] 在 ${ctx.rootDir} 内未定位到 ${binaryName}。`,
            );
        }
        return located;
    }

    /**
     * 补齐可执行位。
     *
     * tar 一般保留 mode，但 zip 不携带 Unix 权限位；本项目对两种归档
     * 都只用“解压 → 验证”一次，验证走 execa（需要执行权限）。安装目录
     * 完全归应用所有，因此统一 chmod 0755 是安全且廉价的保险。
     *
     * 同时处理 `ffprobe`：`probe_media` 在 POSIX 上也直接 execa 它，
     * 只 chmod ffmpeg 会让“ffmpeg 可用但 probe_media 不可用”这种状态
     * 极难排查。文件不存在则静默跳过（缺少 ffprobe 由工具层给出明确错误）。
     *
     * 失败只 warn：若真的不可执行，`verifyExecutable` 会给出更明确的报错。
     */
    async applyPostExtract(ctx: PostExtractContext): Promise<void> {
        if (process.platform === "win32") return;

        const targets: string[] = [ctx.executablePath];
        const ffprobePath = join(
            dirname(ctx.executablePath),
            FFPROBE_BINARY_NAME,
        );
        if (await pathExists(ffprobePath)) targets.push(ffprobePath);

        for (const target of targets) {
            try {
                await fs.chmod(target, 0o755);
            } catch (error) {
                Logger.warn(
                    `[CodeRuntime] 为 ${target} 补齐可执行位失败：${errorMessage(error)}`,
                );
            }
        }
    }

    async verifyExecutable(
        executablePath: string,
        ctx: { timeoutMs?: number; signal?: AbortSignal },
    ): Promise<string> {
        const timeoutMs = ctx.timeoutMs ?? 15_000;
        const result = await execa(executablePath, ["-version"], {
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
            cancelSignal: ctx.signal,
        });
        if (result.exitCode !== 0) {
            throw new Error(
                `ffmpeg -version 失败：${result.stderr || result.stdout || "未知错误"}`,
            );
        }
        const output = (result.stdout || result.stderr).trim();
        if (!output) {
            throw new Error("ffmpeg -version 无输出");
        }
        // 首行形如：`ffmpeg version 8.1.3-... Copyright (c) ...`
        const firstLine = output.split(/\r?\n/)[0]?.trim();
        Logger.log(`[CodeRuntime] ffmpeg 就绪：${firstLine}`);
        return firstLine ?? `ffmpeg ${FFMPEG_VERSION}`;
    }
}

export { FFMPEG_VERSION };
