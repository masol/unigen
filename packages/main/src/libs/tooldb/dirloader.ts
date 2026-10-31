import Logger from "electron-log/main.js";
import type { ToolDefinition } from "./type.js";

/**
 * 从固定目录加载工具定义(占位实现,待补全)。
 *
 * 预期约定:
 * - 扫描 dir 下的 .ts/.js/.mjs 模块;
 * - 每个模块默认导出一个 ToolDefinition 或 ToolDefinition[];
 * - 聚合、按 name 去重后返回。
 *
 * 返回的定义会在 globalToolDB.init() 中被统一注册为 source="directory"。
 */
export async function loadToolsFromDir(dir: string): Promise<ToolDefinition<unknown, unknown>[]> {
    Logger.debug(`[ToolDB] loadToolsFromDir 待实现,跳过: ${dir}`);
    // TODO: 补全动态扫描/import 逻辑
    return [];
}