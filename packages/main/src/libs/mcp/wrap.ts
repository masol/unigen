// packages/main/src/libs/mcp/wrap.ts
import type { Tool } from "ai";
import type { McpToolCallOptions } from "./type.js";

export interface WrapMcpToolArgs {
    serverId: string;
    name: string;
    raw: Tool;
    call: (
        serverId: string,
        name: string,
        args: unknown,
        options?: McpToolCallOptions,
    ) => Promise<unknown>;
}

/**
 * 把原始 MCP Tool 包装成走路由的 Tool。
 *
 * - 保留 inputSchema/outputSchema 等元数据（展开 raw 的所有字段）；
 * - 替换 execute，使每次调用都经过 McpConnectionPool（自动借还连接）；
 * - 使用 `Record<string, unknown>` 展开而非 `as object`，
 *   避免 TS 只看到 `execute` 而误判字段缺失；
 *   运行时结构等价，最后由 unknown 断言回 Tool。
 */
export function wrapMcpTool({
    serverId,
    name,
    raw,
    call,
}: WrapMcpToolArgs): Tool {
    const wrapped: Record<string, unknown> = { ...raw };
    wrapped.execute = async (
        input: unknown,
        options?: McpToolCallOptions,
    ) => {
        return await call(serverId, name, input, {
            toolCallId: options?.toolCallId,
            messages: options?.messages,
            abortSignal: options?.abortSignal,
        });
    };
    return wrapped as unknown as Tool;
}