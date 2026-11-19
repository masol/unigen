// packages/main/src/libs/searchsrv/file-text-loader.ts
import { toMarkdown } from "@mdgate/converters";
import Logger from "electron-log/main.js";
import { readFile } from "node:fs/promises";

/**
 * 读取文件并严格转换为 Markdown 字符串。
 *
 * 可选传入 bytes：调用方如果已经读取了文件内容，直接复用，
 * 避免同一文件被二次读盘。path 仅作为格式提示，不会触发额外磁盘读取。
 */
export async function loadTextFileStrict(
    filePath: string,
    bytes?: Buffer,
): Promise<string> {
    const content = bytes ?? (await readFile(filePath));
    return await toMarkdown(content, { path: filePath });
}

/**
 * 读取文件并返回 Markdown 字符串。
 *
 * 所有格式统一交给 @mdgate/converters 处理：
 * - 文本/源码：@mdgate/text 直接返回或包裹为代码块。
 * - Office/PDF/HTML/CSV 等：对应转换器解析为 GFM。
 *
 * 目录同步时单个文件失败不应中断同步，失败只告警并返回空串。
 * 需要区分失败与空内容的调用方应使用 loadTextFileStrict。
 */
export async function loadTextFile(
    filePath: string,
    bytes?: Buffer,
): Promise<string> {
    try {
        return await loadTextFileStrict(filePath, bytes);
    } catch (error) {
        Logger.warn(`[Search] 读取文件失败，已忽略: ${filePath}`, error);
        return "";
    }
}