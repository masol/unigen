// file-text-loader.ts
import Logger from "electron-log/main.js";
import { readFile } from "node:fs/promises";

/**
 * 读取文本文件内容。
 *
 * 目录同步时单个文件失败不应中断整库/整技能同步，因此失败只告警并返回空串。
 * 后续支持 PDF/Office 等二进制转换时，应只扩展此函数。
 */
export async function loadTextFile(filePath: string): Promise<string> {
    try {
        return await readFile(filePath, "utf8");
    } catch (error) {
        Logger.warn(`[Search] 读取文件失败，已忽略: ${filePath}`, error);
        return "";
    }
}