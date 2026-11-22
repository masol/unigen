// packages/main/src/libs/coderuntime/engines/nodejs.ts
//
// Node.js 引擎（class 实现）：
//   - Windows 使用 zip；macOS / Linux 使用 tar.gz；
//   - 中国区使用清华 / 中科大镜像；其他区域走官方；
//   - 归档 SHA256 从 `nodejs.reg.ts` 读取，与注册表中的版本号一致。
//
// 所有版本 / 地址 / 镜像 / 哈希均来自 `./nodejs.reg.ts`；
// 本文件不含任何硬编码 URL。

import { stableConfig } from "$libs/store/stable.js";
import { execa } from "execa";
import type { EngineRuntimeHandler } from "../types.js";
import {
    NODE_ARCHIVE_SHA256,
    NODE_DIST_BASE,
    NODE_PLATFORM_KEYS,
    NODE_VERSION,
    nodeArchiveExt,
    nodeArchiveRootDir,
} from "./nodejs.reg.js";

function platformKey(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
): string {
    return `${platform}-${arch}`;
}

export class NodeRuntime implements EngineRuntimeHandler {
    readonly id = "nodejs" as const;

    hasDefaultArchive(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): boolean {
        return NODE_PLATFORM_KEYS[platformKey(platform, arch)] !== undefined;
    }

    getDefaultArchiveUrls(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string[] | undefined {
        const key = NODE_PLATFORM_KEYS[platformKey(platform, arch)];
        if (!key) return undefined;

        const ext = nodeArchiveExt(platform);
        const filename = `node-v${NODE_VERSION}-${key}.${ext}`;
        const prefix = `/v${NODE_VERSION}/${filename}`;

        const inChina = stableConfig().get("isChina");
        const bases = inChina && NODE_DIST_BASE.china.length > 0
            ? NODE_DIST_BASE.china
            : [NODE_DIST_BASE.official];

        return bases
            .map((b) => `${b.trim()}`)
            .filter(Boolean)
            .map((b) => `${b}${prefix}`);
    }

    getDefaultExecutableRelativePath(
        platform: NodeJS.Platform,
    ): string | undefined {
        return platform === "win32" ? "node.exe" : "bin/node";
    }

    getDefaultExtractStripPrefix(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined {
        const key = NODE_PLATFORM_KEYS[platformKey(platform, arch)];
        if (!key) return undefined;
        return `${nodeArchiveRootDir(key)}/`;
    }

    /**
     * 归档 SHA256（对应固定版本）。
     *
     * 由于镜像与官方内容一致，此哈希可同时用于官方 / 中国区下载。
     * 只有在用户未指定 `archiveUrl`（走内置源）时，manager 才会采用此值。
     */
    getExpectedSha256(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined {
        return NODE_ARCHIVE_SHA256[platformKey(platform, arch)];
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
                `node --version 失败：${result.stderr || result.stdout || "未知错误"}`,
            );
        }
        return (result.stdout || result.stderr).trim();
    }
}

export { NODE_VERSION };
