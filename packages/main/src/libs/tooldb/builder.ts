import { tool as aiTool, type Tool } from "ai";
import type { ToolDefinition } from "./type.js";

/**
 * 将一个 ToolDefinition 构建为 AI SDK Tool。
 *
 * 关于类型断言:
 *   AI SDK 的 `tool()` 泛型推断在 Zod v3 与 v4 之间有结构差异,
 *   这里对 schema 和 execute 统一做 `as any` 绕过编译检查,
 *   运行期都是 StandardSchema,功能等价。
 */
export function buildAiTool<TInput, TOutput>(def: ToolDefinition<TInput, TOutput>): Tool {
    return aiTool({
        description: def.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: def.inputSchema as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        outputSchema: def.outputSchema as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        execute: ((input: unknown) => def.execute(input as TInput)) as any,
    }) as Tool;
}