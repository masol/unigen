import { clarifyTool } from './tools/clarify.js';
import { renderImageTool } from "./tools/renderimage.js";
import type { ToolDefinition } from "./type.js";

/**
 * 内置工具注册处。
 *
 * 返回 ToolDefinition 数组,会在 globalToolDB.init() 中逐个注入 Registry。
 * description 面向意图写清楚("这个工具能做什么"),供检索自然语言命中;
 * 任何在此添加的工具无需改动其他代码。
 *
 * 示例:
 *   {
 *       name: "get_weather",
 *       description: "查询指定城市的当前天气",
 *       inputSchema: z.object({ city: z.string().describe("城市名") }),
 *       execute: async ({ city }) => ({ city, temp: 25 }),
 *   }
 */
export function getBuiltinTools(): ToolDefinition<unknown, unknown>[] {
    return [
        renderImageTool as ToolDefinition<unknown, unknown>,
        clarifyTool as ToolDefinition<unknown, unknown>,
    ];
}