import { app } from "electron";
import { join } from "node:path";

/** 全局工具库在 userData 下的根目录名,本模块自治,外部无需关心 */
export const toolDbDirName = "tooldb";

export function toolDbBaseDir(): string {
    return join(app.getPath("userData"), toolDbDirName);
}

/** 嵌入模型名/维度等元数据的持久化文件 */
export function embedMetaPath(): string {
    return join(toolDbBaseDir(), "embed-meta.json");
}

/** LanceDB 数据目录 */
export function lanceDataPath(): string {
    return join(toolDbBaseDir(), "lance");
}