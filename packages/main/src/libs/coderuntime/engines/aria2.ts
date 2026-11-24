// packages/main/src/libs/coderuntime/engines/aria2.ts
//
// aria2 运行时引擎。
//
// 三条路径：
//
//   - **Windows（优先托管）**：官方 Release 提供独立二进制，由 manager
//     下载 / 解压 / 校验后托管在 `runtime/code/aria2/`，版本由
//     `aria2.reg.ts` 固定；
//   - **Windows（下载失败兜底）**：托管安装 / 下载最终失败后，回退探测
//     PATH 中的 `aria2c.exe`。若命中则直接使用系统二进制；若未命中，
//     提示用户自行安装并加入 PATH 后重新探测；
//   - **Linux / macOS**：官方 Release 没有桌面二进制，正常路径直接使用
//     系统已安装的 `aria2c`（`detectSystemExecutable()`）。命中时不下载、
//     不解压，直接把系统二进制的绝对路径交给工具层；未命中则抛面向
//     用户的错误，提示用户自行安装后重新启用。
//
// 为什么 Linux / macOS 不做源码编译或第三方二进制分发：
//   - 编译有副作用（需要工具链、耗时不控、失败面大）；
//   - 第三方分发引入新的信任与版本维护成本；
//   - aria2 是各发行版的一等公民，`apt / dnf / pacman / brew` 安装即可，
//     版本差异对 `aria2c` 的命令行语义影响很小。

import Logger from "electron-log/main.js";
import { execa } from "execa";
import type { EngineRuntimeHandler } from "../types.js";
import {
    ARIA2_RELEASE_BASE,
    ARIA2_VERSION,
    resolveAria2Asset,
} from "./aria2.reg.js";
import { findSystemExecutable } from "./system.js";

/** POSIX 系统 PATH 中查找的可执行文件名。 */
const POSIX_SYSTEM_BINARY_NAME = "aria2c";

/** Windows 系统 PATH 中查找的可执行文件名。 */
const WINDOWS_SYSTEM_BINARY_NAME = "aria2c.exe";

/**
 * 允许探测系统已安装 aria2c 的平台。
 *
 * - Linux / macOS：没有官方桌面二进制，正常路径直接使用系统安装；
 * - Windows：默认优先托管安装；只有托管安装 / 下载最终失败后，
 *   manager 才会回退到这里探测 PATH 中的 `aria2c.exe`。
 */
const SYSTEM_BINARY_PLATFORMS: ReadonlySet<NodeJS.Platform> = new Set([
    "win32",
    "linux",
    "darwin",
]);

export class Aria2Runtime implements EngineRuntimeHandler {
    /**
     * 静态 id：`engines/index.js` 用它派生 `KNOWN_ENGINE_IDS` 与做编译期
     * 对齐断言。新增引擎时只需在 `ENGINE_CLASS_LIST` 里登记这个 class。
     */
    static readonly id = "aria2" as const;

    readonly id = Aria2Runtime.id;

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
     * 探测顺序：PATH 各目录 → 通用常见目录（仅 POSIX，见 system.ts）；
     * 返回**第一个**可执行的 `aria2c` / `aria2c.exe` 绝对路径。
     *
     * 这里不做版本验证：manager 拿到路径后会调用 `verifyExecutable()`
     * 执行 `aria2c --version`，避免同一动作重复 spawn 一次进程。
     */
    async detectSystemExecutable(): Promise<string | null> {
        if (!SYSTEM_BINARY_PLATFORMS.has(process.platform)) return null;

        return findSystemExecutable({
            binaryNames: process.platform === "win32"
                ? [WINDOWS_SYSTEM_BINARY_NAME]
                : [POSIX_SYSTEM_BINARY_NAME],
            logLabel: "aria2c",
        });
    }

    getMissingRuntimeMessage(): string {
        if (process.platform === "win32") {
            return (
                `未检测到可用的系统 aria2（或系统版本验证失败）。` +
                `请自行安装 aria2 并将其所在目录加入 PATH 后重新启用或重试，` +
                `也可以在 codeRuntime.engines.aria2.archiveUrl 配置自定义下载源。`
            );
        }
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
        ctx: { timeoutMs?: number; signal?: AbortSignal },
    ): Promise<string> {
        const timeoutMs = ctx.timeoutMs ?? 15_000;
        const result = await execa(executablePath, ["--version"], {
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
            cancelSignal: ctx.signal,
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
