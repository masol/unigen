import { app } from "electron";
import { join } from "node:path";



// 2026-6-26: 废弃本地LLM支持，所有本地LLM配置，实际是rerank模型。
export function rerankPath(): string {
    const dataPath = app.getPath("userData");
    return join(dataPath, "models", "rerank")
}


export function embedingPath(): string {
    const dataPath = app.getPath("userData");
    return join(dataPath, "models", "embeding")
}


export function themeFile(fname?: string): string {
    const dataPath = app.getPath("userData");
    if (fname && fname.length > 0) {
        return join(dataPath, "theme", fname)
    }
    return join(dataPath, "theme");
}