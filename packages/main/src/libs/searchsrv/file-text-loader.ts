// file-text-loader.ts
import { toMarkdown } from "@mdgate/converters";
import Logger from "electron-log/main.js";
import { readFile } from "node:fs/promises";

/**
 * 读取文件并严格转换为 Markdown 字符串。
 *
 * 与 loadTextFile 不同：读取/转换失败会抛错，调用方（如 tool）可以
 * 明确区分“空文件”和“失败”，不会把失败误当成空内容。
 */
export async function loadTextFileStrict(filePath: string): Promise<string> {
    const bytes = await readFile(filePath);
    // path 仅作为格式提示，不会触发二次磁盘读取。
    return await toMarkdown(bytes, { path: filePath });
}

/**
 * 读取文件并返回 Markdown 字符串。
 *
 * 所有格式统一交给 @mdgate/converters 处理：
 * - 文本/源码：@mdgate/text 直接返回或包裹为代码块。
 * - Office/PDF/HTML/CSV 等：对应转换器解析为 GFM。
 *
 * 目录同步时单个文件失败不应中断同步，失败只告警并返回空串。
 * 扩展性：将来如果要支持图片/音频/视频，只需在 toMarkdown 调用时传入
 * image() / audio() / video() 回调，无需改动整体结构。
 *
 * 注意：需要区分失败与空内容的调用方应使用 loadTextFileStrict。
 */
export async function loadTextFile(filePath: string): Promise<string> {
    try {
        return await loadTextFileStrict(filePath);
    } catch (error) {
        Logger.warn(`[Search] 读取文件失败，已忽略: ${filePath}`, error);
        return "";
    }
}