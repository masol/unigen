// packages/main/src/libs/coderuntime/engines/nodejs.ts
//
// Node.js 引擎：
//   - Windows 使用 zip；macOS / Linux 使用官方 tar.gz；
//   - 国内环境自动切换到 npmmirror 镜像（含所有平台）；
//   - 官方归档内层目录 `node-vX.Y.Z-<platform>-<arch>/` 通过 stripPrefix 剥离。
//
// 所有下载地址 / 版本 / 镜像均来自 `../registry.ts`。

import { ipInfo } from "$libs/utils/sys/ip.js";
import { execa } from "execa";
import { pickMirror, RUNTIME_REGISTRY } from "../registry.js";
import type { EngineRuntimeHandler } from "../types.js";

const NODE_VERSION = RUNTIME_REGISTRY.nodejs.version;

function nodePlatformKey(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
): string {
    if (platform === "win32" && (arch === "x64" || arch === "arm64")) {
        return `win-${arch}`;
    }
    if (platform === "darwin" && (arch === "x64" || arch === "arm64")) {
        return `darwin-${arch}`;
    }
    if (platform === "linux" && (arch === "x64" || arch === "arm64")) {
        return `linux-${arch}`;
    }
    return "";
}

export const nodeRuntime: EngineRuntimeHandler = {
    id: "nodejs",

    hasDefaultArchive(platform, arch) {
        return nodePlatformKey(platform, arch) !== "";
    },

    getDefaultArchiveUrl(platform, arch) {
        const key = nodePlatformKey(platform, arch);
        if (!key) return undefined;
        const base = pickMirror(
            RUNTIME_REGISTRY.nodejs.distBase,
            ipInfo.inChina,
        );
        const ext = platform === "win32" ? "zip" : "tar.gz";
        return `${base}/v${NODE_VERSION}/node-v${NODE_VERSION}-${key}.${ext}`;
    },

    getDefaultExecutableRelativePath(platform) {
        return platform === "win32" ? "node.exe" : "bin/node";
    },

    getDefaultExtractStripPrefix(platform, arch) {
        const key = nodePlatformKey(platform, arch);
        if (!key) return undefined;
        return `node-v${NODE_VERSION}-${key}/`;
    },

    async verifyExecutable(executablePath, ctx) {
        const timeoutMs = ctx.timeoutMs ?? 15_000;
        const result = await execa(executablePath, ["--version"], {
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
        });
        if (result.exitCode !== 0) {
            throw new Error(
                `node --version 失败：${result.stderr || result.stdout || "未知错误"}`,
            );
        }
        return (result.stdout || result.stderr).trim();
    },
};

export { NODE_VERSION };
