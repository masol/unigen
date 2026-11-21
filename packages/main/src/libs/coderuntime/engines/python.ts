// packages/main/src/libs/coderuntime/engines/python.ts
//
// Python 引擎（基于 uv）：
//
//   - 下载 `uv` 独立二进制（zip for Windows / tar.gz for macOS,Linux），
//     解压到 `runtime/code/python/uv/`；
//   - `applyPostExtract` 阶段执行 `uv python install <version>`，
//     把 Python 解释器托管到 `runtime/code/python/interpreters/`；
//   - 工具层用 `uv venv` 在任务目录创建 `.venv`，`uv pip install`
//     安装依赖，最后用 `uv run --active --no-project` 执行脚本。
//
// 所有下载地址 / 版本 / 镜像均来自 `../registry.ts`，本文件不解硬编码地址。

import { stableConfig } from "$libs/store/stable.js";
import { codeRuntimePythonInterpretersDir } from "$libs/utils/sys/dir.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import {
    pickMirror,
    platformKey,
    RUNTIME_REGISTRY,
} from "../registry.js";
import type { EngineRuntimeHandler, PostExtractContext } from "../types.js";

/** 从统一注册表派生的默认 Python 版本（可被用户配置覆盖）。 */
const DEFAULT_PYTHON_VERSION = RUNTIME_REGISTRY.python.defaultVersion;

function resolveUvAsset(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
) {
    return RUNTIME_REGISTRY.uv.assets[platformKey(platform, arch)];
}

/**
 * uv 执行环境：
 *   - `UV_PYTHON_INSTALL_DIR`：强制 uv 使用项目隔离的解释器目录，
 *     不污染用户 home（同时符合「崩溃后不残留」约定）；
 *   - `UV_DEFAULT_INDEX`：中国区强制注入清华镜像。
 *
 * 供引擎（安装阶段）与工具（运行阶段）**统一**使用，
 * 避免两处 env 不一致导致行为差异。
 */
export function buildUvEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    env.UV_PYTHON_INSTALL_DIR = codeRuntimePythonInterpretersDir();
    if (stableConfig().get("isChina")) {
        env.UV_DEFAULT_INDEX = RUNTIME_REGISTRY.python.index.china;
    }
    return env;
}

async function installPythonInterpreter(
    uvExe: string,
    version: string,
): Promise<void> {
    Logger.log(`[CodeRuntime] 通过 uv 安装 Python ${version}...`);
    await execa(uvExe, ["python", "install", version], {
        reject: true,
        windowsHide: true,
        env: buildUvEnv(),
        timeout: 15 * 60 * 1000,
    });
}

export const pythonRuntime: EngineRuntimeHandler = {
    id: "python",

    hasDefaultArchive(platform, arch) {
        return resolveUvAsset(platform, arch) != null;
    },

    getDefaultArchiveUrl(platform, arch) {
        const asset = resolveUvAsset(platform, arch);
        if (!asset) return undefined;
        const base = pickMirror(
            RUNTIME_REGISTRY.uv.releaseBase,
            stableConfig().get("isChina"),
        );
        const filename = `uv-${asset.target}.${asset.archive}`;
        return `${base}/${RUNTIME_REGISTRY.uv.version}/${filename}`;
    },

    getDefaultExecutableRelativePath(platform) {
        return platform === "win32" ? "uv.exe" : "uv";
    },

    getDefaultExtractStripPrefix(platform, arch) {
        const asset = resolveUvAsset(platform, arch);
        return asset ? `uv-${asset.target}/` : undefined;
    },

    async applyPostExtract(ctx: PostExtractContext) {
        const version = ctx.engineConfig.version ?? DEFAULT_PYTHON_VERSION;
        await installPythonInterpreter(ctx.executablePath, version);
    },

    async verifyExecutable(executablePath, ctx) {
        const timeoutMs = ctx.timeoutMs ?? 15_000;
        const result = await execa(executablePath, ["--version"], {
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
            env: buildUvEnv(),
        });
        if (result.exitCode !== 0) {
            throw new Error(
                `uv --version 失败：${result.stderr || result.stdout || "未知错误"}`,
            );
        }
        return (result.stdout || result.stderr).trim();
    },
};

export { DEFAULT_PYTHON_VERSION };
