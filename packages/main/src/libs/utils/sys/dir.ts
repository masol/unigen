import { app } from "electron";
import { join } from "node:path";

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