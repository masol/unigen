import type { Tool } from "ai";

export type ToolSource = "builtin" | "mcp";

export interface ToolMeta {
    /**
     * 全局唯一、跨重启稳定的 ID: builtin::<name> 或 mcp::<serverId>::<name>。
     * 确定性派生,无需维护。工具流持久化时应引用此 ID,执行时 getTool(id)。
     */
    id: string;
    /** 原始工具名,LLM 可读,但不保证全局唯一(多 MCP server 可能撞名) */
    name: string;
    /**
     * 唯一化且符合 tool-name 规范的名字,toToolSet() 用它作 ToolSet 的 key。
     * 不撞名时等于 sanitize(name),撞名时自动带 serverId 前缀。
     */
    llmName: string;
    description: string;
    source: ToolSource;
    /** 仅 mcp 来源有值 */
    serverId?: string;
}

export interface RegisteredTool extends ToolMeta {
    /** 可直接交给 generateText/streamText 的 AI SDK Tool。MCP 工具在连接时已完成转化 */
    tool: Tool;
}

export interface ToolSearchResult extends RegisteredTool {
    /** vector: _distance 越小越近; fuse: Fuse score 越小越好 */
    score: number;
    matchedBy: "vector" | "fuse";
}

/**
 * 重排序钩子:对召回的候选按 query 重新排序并筛选,返回最终结果(长度 <= limit)。
 * 默认实现为直通截断,后续接入 rerank 模型时替换。
 */
export type Reranker = (
    query: string,
    candidates: ToolSearchResult[],
    limit: number,
) => Promise<ToolSearchResult[]>;

/** MCP 服务器持久化配置。配置界面写入 configService,本模块只读 */
export interface McpServerConfig {
    id: string;
    name?: string;
    /** 默认 true */
    enabled?: boolean;
    transport:
    | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
    | { type: "sse"; url: string; headers?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string> };
}