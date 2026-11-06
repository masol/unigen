// packages/main/src/libs/blueprint/capability/local/agent/types.ts

import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ModelMessage } from "ai";
import { randomUUID } from "node:crypto";
import type { LocalMcpClient } from "../mcp.js";
import type { CompiledPacAgent, JsonValue, LocalMcpConfig } from "../type.js";

/**
 * 运行期 MCP 客户端缓存。
 *
 * 值使用 Promise 而不是已连接 client：同一 run 内多个子 agent 并行物化工具时，
 * 对同一 LocalMcpConfig 只会发起一次 connectLocalMcp，其余等待同一个 Promise。
 * Map 本身由每次根 run 在堆栈上创建，不跨 run 共享。
 */
export type McpClientCache = Map<LocalMcpConfig, Promise<LocalMcpClient>>;

/**
 * Trace 节点 ID 注册表：内部语义键 ↔ 对外 UUID。
 *
 * 背景：早期实现把 `agent|${agentId}#${seq}` 这类确定性字符串直接当作 trace 节点 ID
 * 写入数据库。相同 agent 在不同 message 中被调用时，后写入的行会按主键覆盖先写入的行,
 * 导致历史消息的 trace 信息丢失。
 *
 * 做法：
 * - 对外（前端事件、数据库 upsert）一律使用 crypto.randomUUID 生成的 UUID；
 * - 代码内部保留确定性 "内部键"（如 `agent:${agentId}:${seq}`）用于在同一次 run 中
 *   把流式阶段的多次事件（start / delta / end）稳定关联到同一个节点；
 * - 每次 run 持有独立的注册表实例，不同 run 对同一内部键会得到不同 UUID，天然避免冲突。
 *
 * 内部键永远不要暴露给客户端，也不要写入数据库。
 */
export class TraceIdRegistry {
    private readonly keyToId = new Map<string, string>();
    private readonly idToKey = new Map<string, string>();

    /**
     * 为内部键分配（或返回已分配的）UUID。幂等。
     */
    getOrCreate(internalKey: string): string {
        let id = this.keyToId.get(internalKey);
        if (!id) {
            id = randomUUID();
            this.keyToId.set(internalKey, id);
            this.idToKey.set(id, internalKey);
        }
        return id;
    }

    /** 仅查询，不创建 */
    get(internalKey: string): string | undefined {
        return this.keyToId.get(internalKey);
    }

    /** 根据 UUID 反查其内部键，用于派生子节点的内部键 */
    internalKeyOf(id: string): string | undefined {
        return this.idToKey.get(id);
    }
}

/**
 * Agent 的 thinking 状态（per-agent，存储在 PacRunState 中）
 */
export interface AgentThinkingState {
    /** 是否已收到 text-start（正文开始） */
    textStarted: boolean;
    /** reasoning 轮次计数（用于生成唯一节点 ID） */
    reasoningCount: number;
    /** 当前活跃的 reasoning 节点 ID（UUID） */
    currentReasoningNodeId?: string;
}

export interface PacRunState {
    messageId: string;
    counters: Map<string, number>;
    modelInfo?: { providerId: string; modelId: string };
    /** 每个 agent 的 thinking 状态（按 agentTraceNodeId / UUID 索引） */
    thinkingStates: Map<string, AgentThinkingState>;
    /** 内部语义键 → UUID 的注册表（每次 run 独立实例） */
    idRegistry: TraceIdRegistry;
    /**
     * 是否持久化消息与 trace 到数据库。
     * false 时：不写 messages 表，也不写 trace 表；
     * 但 ctx.report 实时事件照常发送，前端仍能看到完整过程。
     */
    persist: boolean;
}

export interface ToolCallTraceInfo {
    traceId: string;
    isAgent: boolean;
}

export interface RunOptions {
    validateInputs?: boolean;
    isRoot?: boolean;
    stepPath?: string;
    parentTraceId?: string;
}

export interface StreamResult {
    text: string;
    usage: unknown;
}

export interface GenerateCallArgs {
    messages: ModelMessage[];
    abortSignal: AbortSignal;
    timeout?: unknown;
    temperature?: number;
    maxOutputTokens?: number;
    toolCallConcurrency?: number;
    strict?: boolean;
}

export interface ToolExecStartEvent {
    toolCall: {
        toolName: string;
        toolCallId: string;
        input: unknown;
    };
}

export interface ToolExecEndEvent {
    toolCall: {
        toolName: string;
        toolCallId: string;
    };
    toolExecutionMs: number;
    toolOutput:
    | { type: "tool-result"; output: unknown }
    | { type: "tool-error"; error: unknown };
}

/**
 * Agent 执行器接口 - 用于打破循环依赖
 *
 * tools.ts 需要调用子 agent，但不应依赖完整的 PacAgent 类型
 */
export interface IAgentExecutor {
    runSubAgent(
        compiled: CompiledPacAgent,
        ctx: IRunnerContext,
        inputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue>,
        options: RunOptions,
        mcpClients: McpClientCache,
        state: PacRunState,
    ): Promise<string>;
}