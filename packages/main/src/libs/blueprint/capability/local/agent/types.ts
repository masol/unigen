// packages/main/src/libs/blueprint/capability/local/agent/types.ts

import type { ModelMessage } from "ai";

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