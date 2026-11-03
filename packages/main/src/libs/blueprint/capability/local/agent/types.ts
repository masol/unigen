// packages/main/src/libs/blueprint/capability/local/agent/types.ts

import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ModelMessage } from "ai";
import type { LocalMcpClient } from "../mcp.js";
import type { CompiledPacAgent, JsonValue, LocalMcpConfig } from "../type.js";

export interface PacRunState {
    messageId: string;
    counters: Map<string, number>;
    modelInfo?: { providerId: string; modelId: string };
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
 * 各 provider 的 thinking 配置常量（运行时值）
 */
export const THINKING_PROVIDER_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({
    anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
    openai: { reasoningEffort: "medium" },
    google: { thinkingConfig: { includeThoughts: true } },
});

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
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        state: PacRunState,
    ): Promise<string>;
}