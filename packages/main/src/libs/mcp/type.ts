// packages/main/src/libs/mcp/type.ts
import type { Tool } from "ai";

export type { McpServerConfig } from "$types/shared/mcp.js";

export interface McpToolCallOptions {
    toolCallId?: string;
    messages?: unknown[];
    abortSignal?: AbortSignal;
}

/**
 * MCP 连接租约。
 *
 * - acquire 后连接引用计数 +1；
 * - 调用方必须在 finally 中 release()；
 * - tools 是原始 AI SDK Tool，调用期间连接不会被关闭；
 * - callTool 是带租约的便捷调用，不会重复 acquire。
 */
export interface McpConnectionLease {
    readonly serverId: string;
    readonly generation: number;
    readonly tools: Readonly<Record<string, Tool>>;
    callTool(
        toolName: string,
        args: unknown,
        options?: McpToolCallOptions,
    ): Promise<unknown>;
    release(): void;
}

/**
 * 工具描述。tool 是稳定包装器：
 * execute 内部会向 McpConnectionPool acquire/release 连接。
 * tooldb 直接把它绑定为 ToolMeta.tool 即可。
 */
export interface McpToolDescriptor {
    serverId: string;
    name: string;
    description: string;
    /**
     * 产生该 descriptor 时对应 MCP server 配置的稳定指纹。
     *
     * 由 `stableStringify(cfg)` 生成，用于 tooldb 持久化后，
     * 启动期跨重启判断“停机期间配置是否变化”。
     */
    configFingerprint?: string;
    tool: Tool;
}

export interface McpServerToolSnapshot {
    serverId: string;
    connected: boolean;
    tools: readonly McpToolDescriptor[];
}

/**
 * 配置对齐结果。
 *
 * - changed：配置新增或变化，需要调用方 discoverTools 后更新 tooldb；
 * - removed：配置删除或从 enabled 变 disabled，需要调用方从 tooldb 移除；
 * - unchanged：配置无变化，无需任何操作。
 */
export interface SetServersResult {
    changed: string[];
    removed: string[];
    unchanged: string[];
}