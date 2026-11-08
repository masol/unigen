// packages/main/src/libs/tooldb/type.ts
import type { Tool } from "ai";
import type { z } from "zod";

/**
 * 工具来源：
 * - builtin: 启动期由 `init({ builtins })` 注入，或运行期 `register()` 的代码工具；
 * - mcp:     通过 MCP server 远端提供。
 *
 * 目录加载已移除，不再支持 directory 来源。
 */
export type ToolSource = "builtin" | "mcp";

/**
 * 工具元数据，全局工具库中的最小可寻址单元。
 *
 * 三个标识字段各自分工，不可合并：
 * - id:      稳定全局标识（builtin::name / mcp::serverId::name）。
 *            用于跨重启引用、外部持久化、元工具过滤、内部查找。
 * - name:    原始工具名，保持不动，可以是自然语言，直接给人/LLM 阅读。
 * - llmName: sanitize(name) 后的合法 ToolSet key（[a-zA-Z0-9_-]，<=64）。
 *            AI SDK tool name 对 `::` 等字符不安全，必须单独维护合法版本。
 */
export interface ToolMeta<TInput = unknown, TOutput = unknown> {
    /** 全局唯一且跨重启稳定：builtin::<name> | mcp::<serverId>::<name> */
    id: string;
    /** 原始工具名，LLM 可读；保持原始，不 sanitize */
    name: string;
    /** 唯一化且符合 tool-name 规范的名字，用作 ToolSet 的 key */
    llmName: string;
    description: string;
    source: ToolSource;
    /** 仅 mcp 来源有值 */
    serverId?: string;
    /** AI SDK Tool，直接可用于 generateText/streamText */
    tool: Tool;
    /** zod 入参 schema。builtin 工具必有；MCP 工具通常缺省 */
    inputSchema?: z.ZodType<TInput>;
    /** zod 出参 schema，可选 */
    outputSchema?: z.ZodType<TOutput>;
    /** 直接 execute（绕过 AI SDK）。MCP 工具通常缺省 */
    execute?: (input: TInput) => Promise<TOutput> | TOutput;
}

/**
 * 注册工具的 DSL：强类型、零样板。
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    name: string;
    description: string;
    inputSchema: z.ZodType<TInput>;
    outputSchema?: z.ZodType<TOutput>;
    execute: (input: TInput) => Promise<TOutput> | TOutput;
}

/** MCP 服务器配置 */
export interface McpServerConfig {
    id: string;
    name?: string;
    enabled?: boolean;
    transport:
    | {
        type: "stdio";
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
    }
    | { type: "sse"; url: string; headers?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string> };
}