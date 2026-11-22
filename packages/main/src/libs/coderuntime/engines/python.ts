// packages/main/src/libs/coderuntime/engines/python.ts
//
// Python 引擎（基于 uv，class 实现）：
//
//   1. 下载 `uv` 独立二进制（zip for Windows / tar.gz for macOS,Linux），
//      解压到 `runtime/code/python/`；
//   2. `applyPostExtract` 阶段执行 `uv python install <version>`，
//      解释器由 uv 托管在 `runtime/code/python/interpreters/`；
//   3. 工具层用 `uv venv` 在项目目录创建 `.venv`，`uv pip install` 安装依赖，
//      最后用 `uv run --active --no-project` 执行脚本。
//
// 全部产物（uv 二进制 / Python 解释器 / 缓存）限制在 `<userData>/runtime/code/python/`
// 下，绝不写入用户 home；`UV_*` 环境变量全程通过 execa `env` 注入。
//
// 所有版本 / 地址 / 镜像均来自 `./python.reg.ts`。

import { stableConfig } from "$libs/store/stable.js";
import {
    codeRuntimeDir,
    codeRuntimePythonInterpretersDir,
    codeRuntimeUvCacheDir,
} from "$libs/utils/sys/dir.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import type { EngineRuntimeHandler, PostExtractContext } from "../types.js";
import {
    PYPI_INDEX,
    PYTHON_BUILD_STANDALONE_MIRROR,
    PYTHON_DEFAULT_VERSION,
    UV_ASSETS,
    UV_BINARY_BASE,
    UV_VERSION,
} from "./python.reg.js";

function platformKey(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
): string {
    return `${platform}-${arch}`;
}

function resolveUvAsset(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
) {
    return UV_ASSETS[platformKey(platform, arch)];
}

function firstNonEmpty(list: readonly string[]): string | undefined {
    return list.map((s) => s.trim()).find(Boolean);
}

/**
 * uv 执行环境（**所有**调用都通过此函数构造）。
 *
 * 关键约束：所有产物限制在应用数据目录下：
 *   - `UV_INSTALL_DIR`       ：uv 二进制落地目录（防 `uv self install` 写 home）。
 *   - `UV_PYTHON_INSTALL_DIR`：uv 托管 Python 解释器目录。
 *   - `UV_CACHE_DIR`         ：uv 缓存与解析中间结果目录。
 *
 * 中国区额外注入：
 *   - `UV_PYTHON_INSTALL_MIRROR`：python-build-standalone 国内镜像；
 *   - `UV_DEFAULT_INDEX` / `UV_INDEX_URL`：PyPI 国内镜像。
 *
 * 严禁修改 `process.env`；所有调用必须通过 execa `env` 传入。
 */
export function buildUvEnv(
    overrides?: Record<string, string>,
): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    // 本地隔离：三项都必须设置，缺一不可。
    env.UV_INSTALL_DIR = codeRuntimeDir("python", "bin");
    env.UV_PYTHON_INSTALL_DIR = codeRuntimePythonInterpretersDir();
    env.UV_CACHE_DIR = codeRuntimeUvCacheDir();

    if (stableConfig().get("isChina")) {
        const mirror = firstNonEmpty(PYTHON_BUILD_STANDALONE_MIRROR.china);
        if (mirror) env.UV_PYTHON_INSTALL_MIRROR = mirror;

        const index = firstNonEmpty(PYPI_INDEX.china);
        if (index) {
            env.UV_DEFAULT_INDEX = index;
            env.UV_INDEX_URL = index;
        }
    }

    if (overrides) {
        for (const [k, v] of Object.entries(overrides)) {
            env[k] = v;
        }
    }
    return env;
}

export class PythonRuntime implements EngineRuntimeHandler {
    readonly id = "python" as const;

    hasDefaultArchive(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): boolean {
        return resolveUvAsset(platform, arch) != null;
    }

    getDefaultArchiveUrls(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string[] | undefined {
        const asset = resolveUvAsset(platform, arch);
        if (!asset) return undefined;

        const filename = `uv-${asset.target}.${asset.archive}`;
        const suffix = `/${UV_VERSION}/${filename}`;

        const inChina = stableConfig().get("isChina");
        const bases = inChina && UV_BINARY_BASE.china.length > 0
            ? UV_BINARY_BASE.china
            : [UV_BINARY_BASE.official];

        return bases
            .map((b) => b.trim())
            .filter(Boolean)
            .map((b) => `${b}${suffix}`);
    }

    getDefaultExecutableRelativePath(
        platform: NodeJS.Platform,
    ): string | undefined {
        return platform === "win32" ? "uv.exe" : "uv";
    }

    getDefaultExtractStripPrefix(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined {
        const asset = resolveUvAsset(platform, arch);
        return asset ? `uv-${asset.target}/` : undefined;
    }

    async applyPostExtract(ctx: PostExtractContext): Promise<void> {
        const version = ctx.engineConfig.version ?? PYTHON_DEFAULT_VERSION;
        await this.#installPythonInterpreter(ctx.executablePath, version);
    }

    async #installPythonInterpreter(
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

    async verifyExecutable(
        executablePath: string,
        ctx: { timeoutMs?: number },
    ): Promise<string> {
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
    }
}

export { PYTHON_DEFAULT_VERSION as DEFAULT_PYTHON_VERSION };
