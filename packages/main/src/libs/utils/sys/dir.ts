import { KcDirName, SkillsDirName } from "$libs/const.js";
import { app } from "electron";
import Logger from "electron-log";
import { join } from "node:path";
import { knowledgeCenter } from "../kc.js";

export function rerankPath(): string {
    const dataPath = app.getPath("userData");
    return join(dataPath, "models", "rerank");
}

export function embedingPath(): string {
    const dataPath = app.getPath("userData");
    return join(dataPath, "models", "embeding");
}

// export function capFile(fname?: string | string[]): string {
//     const dataPath = app.getPath("userData");
//     if (fname && fname.length > 0) {
//         const parts = Array.isArray(fname) ? fname : [fname];
//         return join(dataPath, "cap", ...parts);
//     }
//     return join(dataPath, "cap");
// }

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

// export function dataFile(fname?: string): string {
//     const dataPath = app.getPath("userData");
//     if (fname && fname.length > 0) {
//         return join(dataPath, "theme", fname);
//     }
//     return join(dataPath, "theme");
// }

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


export function getBuildinPath(name: string, ...sub: string[]): string {
    let basePath: string | undefined
    switch (name) {
        case 'llm':
        case 'rerank':
            basePath = join(rerankPath())
            break
        case 'embeding':
            basePath = join(embedingPath())
            break
        case 'kc':
            basePath = knowledgeCenter.kcPath
            break
        case 'logs':
            basePath = Logger.transports.file.getFile().path
            break
        case 'global-skill':
            basePath = globalSkillDir(...sub)
            break
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