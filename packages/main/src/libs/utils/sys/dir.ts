import { KcDirName, McpDirName, SkillsDirName } from "$libs/const.js";
import { configService } from "$libs/store/index.js";
import { app } from "electron";
import Logger from "electron-log";
import { join } from "node:path";
import { knowledgeCenter } from "../kc.js";

/**
 * monaco编辑器的主题存放路径。
 * @param fname 
 * @returns 
 */
export function themeFile(fname?: string): string {
    const dataPath = app.getPath("userData");
    if (fname && fname.length > 0) {
        return join(dataPath, "theme", fname);
    }
    return join(dataPath, "theme");
}

/**
 * 全局lance数据存放目录。
 * @param parts 
 * @returns 
 */
export function lanceGlobalDir(...parts: string[]): string {
    const dataPath = app.getPath("userData");
    return join(dataPath, "lance", ...parts);
}

/**
 * 返回lance_models目录下的文件。
 * @returns 
 */
export function lanceModelDir(...parts: string[]): string {
    return join(app.getPath("userData"), "lance-models", ...parts);
}

export function globalSkillDir(...sub: string[]): string {
    return join(app.getPath("userData"), SkillsDirName, ...sub);
}

export function globalKbDir(...sub: string[]): string {
    return join(app.getPath("userData"), KcDirName, ...sub);
}

export function globalMCPDir(...sub: string[]): string {
    return join(app.getPath("userData"), McpDirName, ...sub);
}

/**
 * 代码运行时根目录：`<userData>/runtime/code`。
 * 各引擎解压到 `runtime/code/<engine>/`；下载缓存与断点文件存放在
 * `runtime/code/_downloads/<engine>/`（`_` 前缀用于与真实运行时目录区分）。
 */
export function codeRuntimeDir(...parts: string[]): string {
    return join(app.getPath("userData"), "runtime", "code", ...parts);
}

/** 代码运行时下载缓存 / 续传文件目录。 */
export function codeRuntimeDownloadDir(...parts: string[]): string {
    return codeRuntimeDir("_downloads", ...parts);
}

/** uv 可执行文件所在的运行时目录（下载 / 解压目标）。 */
export function codeRuntimeUvDir(...parts: string[]): string {
    return codeRuntimeDir("python", "uv", ...parts);
}

/**
 * uv 托管的 Python 解释器安装目录。
 * 通过 `UV_PYTHON_INSTALL_DIR` 环境变量暴露给 uv，避免污染用户 home。
 */
export function codeRuntimePythonInterpretersDir(...parts: string[]): string {
    return codeRuntimeDir("python", "interpreters", ...parts);
}

/**
 * uv 缓存目录（`UV_CACHE_DIR`）。
 * 限制在应用数据目录下，避免写入 `~/.cache/uv`。
 */
export function codeRuntimeUvCacheDir(...parts: string[]): string {
    return codeRuntimeDir("python", "cache", ...parts);
}

export function getBuildinPath(name: string, ...sub: string[]): string {
    let basePath: string | undefined
    switch (name) {
        case 'kc':
            basePath = knowledgeCenter.kcPath
            break
        case 'logs':
            basePath = Logger.transports.file.getFile().path
            break
        case 'global-skill':
            basePath = globalSkillDir(...sub)
            break
        case 'task_dir':
            basePath = join(configService().get("task_dir"), ...sub);
            break;
        default:
            try {
                // @ts-expect-error 无类型。
                const tempPath = app.getPath(name)
                basePath = join(tempPath)
            } catch (e) {
                void e
                return ""
            }
    }
    if (basePath) {
        return join(basePath, ...(sub ?? []))
    }
    return ""
}