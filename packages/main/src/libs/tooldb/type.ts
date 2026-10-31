import type { Tool } from "ai";
import type { z } from "zod";

/**
 * 工具来源:
 * - builtin:   启动期由 `init({ builtins })` 注入 或 运行期 `register()` 的代码工具;
 * - directory: 启动期由 `init({ toolDirs })` 从文件系统目录扫描加载;
 * - mcp:       通过 MCP server 远端提供。
 */
export type ToolSource = "builtin" | "directory" | "mcp";

/**
 * 工具元数据,全局工具库中的最小可寻址单元。
 *
 * - inputSchema/outputSchema 使用 zod,与 Vercel AI SDK 原生兼容;
 *   需要持久化为 JSON Schema 时,可用 zod 自带的转换(v4: `z.toJSONSchema`,
 *   v3: `zod-to-json-schema`)序列化。
 * - tool 字段预先物化为 AI SDK Tool,挂进 ToolSet 零成本。
 * - MCP 来源的工具 inputSchema/outputSchema/execute 通常缺省
 *   (远端执行,仅通过 tool 字段代理),调用一律走 `meta.tool`。
 */
export interface ToolMeta<TInput = unknown, TOutput = unknown> {
    /** 全局唯一且跨重启稳定: builtin::<name> | directory::<name> | mcp::<serverId>::<name> */
    id: string;
    /** 原始工具名,LLM 可读 */
    name: string;
    /** 唯一化且符合 tool-name 规范的名字,用作 ToolSet 的 key */
    llmName: string;
    description: string;
    source: ToolSource;
    /** 仅 mcp 来源有值 */
    serverId?: string;
    /** AI SDK Tool,直接可用于 generateText/streamText */
    tool: Tool;
    /** zod 入参 schema。builtin/directory 工具必有;MCP 工具通常缺省 */
    inputSchema?: z.ZodType<TInput>;
    /** zod 出参 schema,可选 */
    outputSchema?: z.ZodType<TOutput>;
    /** 直接 execute(绕过 AI SDK)。MCP 工具通常缺省 */
    execute?: (input: TInput) => Promise<TOutput> | TOutput;
}

/** 元信息视图(列表/诊断用,不含实现) */
export type ToolBrief = Pick<ToolMeta, "id" | "name" | "llmName" | "description" | "source" | "serverId">;

/**
 * 注册工具的 DSL:强类型、零样板。
 *   globalToolDB.register({
 *       name: "get_weather",
 *       description: "查询指定城市的当前天气",
 *       inputSchema: z.object({ city: z.string() }),
 *       execute: async ({ city }) => ({ temp: 25 }),
 *   });
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
    name: string;
    description: string;
    inputSchema: z.ZodType<TInput>;
    outputSchema?: z.ZodType<TOutput>;
    execute: (input: TInput) => Promise<TOutput> | TOutput;
}

/** 检索结果,附带得分与命中方式 */
export interface ToolSearchResult extends ToolMeta {
    /** fuse score: 越小越相关 */
    score: number;
    matchedBy: "fuse";
}

/** 重排序钩子;默认直通截断,后续可接入 rerank 模型 */
export type Reranker = (
    query: string,
    candidates: ToolSearchResult[],
    limit: number,
) => Promise<ToolSearchResult[]>;

/** MCP 服务器配置 */
export interface McpServerConfig {
    id: string;
    name?: string;
    enabled?: boolean;
    transport:
    | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
    | { type: "sse"; url: string; headers?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string> };
}