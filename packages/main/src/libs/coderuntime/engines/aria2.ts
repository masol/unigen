// packages/main/src/libs/coderuntime/engines/aria2.ts
//
// aria2 运行时引擎。
//
// 两条安装路径：
//
//   - **Windows**：官方 Release 提供独立二进制，由 manager 下载 / 解压 /
//     校验后托管在 `runtime/code/aria2/`，版本由 `aria2.reg.ts` 固定；
//   - **Linux / macOS**：官方 Release 没有桌面二进制，改为使用**系统已
//     安装的 aria2c**（`detectSystemExecutable()`）。命中时不下载、不解压，
//     直接把系统二进制的绝对路径交给工具层；未命中则抛面向用户的错误，
//     提示用户自行安装后重新启用。
//
// 为什么 Linux / macOS 不做源码编译或第三方二进制分发：
//   - 编译有副作用（需要工具链、耗时不控、失败面大）；
//   - 第三方分发引入新的信任与版本维护成本；
//   - aria2 是各发行版的一等公民，`apt / dnf / pacman / brew` 安装即可，
//     版本差异对 `aria2c` 的命令行语义影响很小。

import Logger from "electron-log/main.js";
import { execa } from "execa";
import { constants, promises as fs } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import type { EngineRuntimeHandler } from "../types.js";
import {
    ARIA2_RELEASE_BASE,
    ARIA2_VERSION,
    resolveAria2Asset,
} from "./aria2.reg.js";

/** 系统 PATH 中查找的可执行文件名。 */
const SYSTEM_BINARY_NAME = "aria2c";

/**
 * 使用**系统已安装** aria2c 的平台。
 *
 * Windows 仍走官方 Release 托管安装：官方确实提供桌面二进制，托管安装
 * 版本可控、行为确定，因此不让系统 PATH 里的二进制抢占它。
 */
const SYSTEM_BINARY_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set([
    "linux",
    "darwin",
]);

/**
 * PATH 之外额外尝试的安装目录。
 *
 * 动机：GUI 启动的桌面应用（尤其 macOS）继承的是 launchd 的最小 PATH
 * （`/usr/bin:/bin:/usr/sbin:/sbin`），Homebrew（`/opt/homebrew/bin`、
 * `/usr/local/bin`）与 MacPorts（`/opt/local/bin`）通常不在其中；
 * Linux 上 `/usr/local/bin`、`/snap/bin` 也可能缺失。
 *
 * 这些都是**只读探测**：命中后 manager 仍会执行 `aria2c --version`
 * 验证，因此不会引入误判风险；代价仅仅是几十次 `stat`。
 */
const EXTRA_SEARCH_DIRS: Partial<Record<NodeJS.Platform, readonly string[]>> = {
    darwin: [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
    ],
    linux: [
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/snap/bin",
    ],
};

/**
 * 构造探测目录列表：PATH 在前，补充目录在后，去重后顺序稳定。
 *
 * 只在 POSIX 平台上被调用（Windows 不参与系统二进制探测），因此用 `:`
 * 作分隔符即可。PATH 中非绝对路径的条目（`~` 展开、相对目录）被丢弃：
 * 它们在 GUI 进程里依赖 cwd，语义不可靠。
 */
function buildSearchDirs(): string[] {
    const fromEnv = (process.env.PATH ?? "")
        .split(":")
        .map((entry) => entry.trim())
        .filter((entry) => entry.startsWith("/"));
    const extra = EXTRA_SEARCH_DIRS[process.platform] ?? [];

    const seen = new Set<string>();
    const dirs: string[] = [];
    for (const dir of [...fromEnv, ...extra]) {
        // 归一化去掉尾部斜杠，避免同一目录被探测多次。
        const normalized = resolvePath(dir);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        dirs.push(normalized);
    }
    return dirs;
}

/** 目标是否为**可执行**的普通文件（POSIX 语义，不看扩展名）。 */
async function isExecutableFile(target: string): Promise<boolean> {
    try {
        const info = await fs.stat(target);
        if (!info.isFile()) return false;
        await fs.access(target, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

export class Aria2Runtime implements EngineRuntimeHandler {
    readonly id = "aria2" as const;

    /**
     * 托管下载源只有官方 GitHub Release；manager 据此启用 GitHub 代理
     * 注入（中国区）与浏览器 UA。系统二进制不经过下载器，与本标志无关。
     */
    readonly isGithubArchive = true;

    hasDefaultArchive(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): boolean {
        return resolveAria2Asset(platform, arch) != null;
    }

    /**
     * 探测系统已安装的 aria2c。
     *
     * 探测顺序：PATH 各目录 → `EXTRA_SEARCH_DIRS`（见文件头注释）；
     * 返回**第一个**可执行的 `aria2c` 绝对路径。
     *
     * 这里不做版本验证：manager 拿到路径后会调用 `verifyExecutable()`
     * 执行 `aria2c --version`，避免同一动作重复 spawn 一次进程。
     */
    async detectSystemExecutable(): Promise<string | null> {
        if (!SYSTEM_BINARY_PLATFORMS.has(process.platform)) return null;

        const dirs = buildSearchDirs();
        for (const dir of dirs) {
            const candidate = join(dir, SYSTEM_BINARY_NAME);
            if (!(await isExecutableFile(candidate))) continue;
            Logger.log(
                `[CodeRuntime] 检测到系统安装的 aria2：${candidate}`,
            );
            return candidate;
        }

        Logger.log(
            `[CodeRuntime] 未检测到系统安装的 aria2c（已检查 ${dirs.length} 个目录）。`,
        );
        return null;
    }

    getMissingRuntimeMessage(): string {
        if (!SYSTEM_BINARY_PLATFORMS.has(process.platform)) {
            return (
                `aria2 在当前平台（${process.platform}-${process.arch}）没有内置下载源，` +
                `请配置 codeRuntime.engines.aria2.archiveUrl 后重试。`
            );
        }
        return (
            `未检测到系统安装的 aria2，无法启用 aria2 下载工具。` +
            `请先自行安装 aria2 后重新启用：` +
            `macOS 可执行 brew install aria2，` +
            `Debian/Ubuntu 可执行 apt install aria2，` +
            `Fedora 可执行 dnf install aria2，` +
            `Arch 可执行 pacman -S aria2。` +
            `安装完成后重新启用即可，会直接使用系统中的 aria2c。`
        );
    }

    getDefaultArchiveUrls(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string[] | undefined {
        const asset = resolveAria2Asset(platform, arch);
        if (!asset) return undefined;
        return [`${ARIA2_RELEASE_BASE}/${asset.filename}`];
    }

    getDefaultExecutableRelativePath(
        platform: NodeJS.Platform,
    ): string | undefined {
        return platform === "win32" ? "aria2c.exe" : "aria2c";
    }

    getDefaultExtractStripPrefix(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined {
        const asset = resolveAria2Asset(platform, arch);
        return asset ? `${asset.rootDir}/` : undefined;
    }

    async verifyExecutable(
        executablePath: string,
        ctx: { timeoutMs?: number },
    ): Promise<string> {
        const timeoutMs = ctx.timeoutMs ?? 15_000;
        const result = await execa(executablePath, ["--version"], {
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
        });
        if (result.exitCode !== 0) {
            throw new Error(
                `aria2c --version 失败：${result.stderr || result.stdout || "未知错误"}`,
            );
        }
        const output = (result.stdout || result.stderr).trim();
        if (!output) {
            throw new Error("aria2c --version 无输出");
        }
        const firstLine = output.split(/\r?\n/)[0]?.trim();
        Logger.log(`[CodeRuntime] aria2 就绪：${firstLine}`);
        return firstLine ?? `aria2 ${ARIA2_VERSION}`;
    }
}

export { ARIA2_VERSION };
