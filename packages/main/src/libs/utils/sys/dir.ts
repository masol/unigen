import { app } from "electron";
import { join } from "node:path";


export function llmPath(): string {
    const dataPath = app.getPath("userData");
    return join(dataPath, "models", "llm")
}


export function embedingPath(): string {
    const dataPath = app.getPath("userData");
    return join(dataPath, "models", "embeding")
}