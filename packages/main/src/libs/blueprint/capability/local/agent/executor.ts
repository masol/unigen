// packages/main/src/libs/blueprint/capability/local/agent/executor.ts

import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { MessageStreamEvent, TraceStreamEvent } from "$types/shared/chat.js";
import type { ModelMessage, ToolLoopAgent } from "ai";
import Logger from "electron-log/main.js";
import type { ResolvedSettings } from "../type.js";
import { MessageDeltaBuffer } from "./buffer.js";
import type { AgentThinkingState, GenerateCallArgs, PacRunState, StreamResult } from "./types.js";
import { formatDurationMs } from "./utils.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolLoopAgent = ToolLoopAgent<any, any, any, any>;

export function buildCallArgs(
    messages: ModelMessage[],
    ctx: IRunnerContext,
    settings: ResolvedSettings,
): GenerateCallArgs {
    const args: GenerateCallArgs = {
        messages,
        abortSignal: ctx.signal,
        timeout: settings.timeout,
    };

    if (settings.temperature !== undefined) args.temperature = settings.temperature;
    if (settings.maxOutputTokens !== undefined) args.maxOutputTokens = settings.maxOutputTokens;
    if (settings.toolCallConcurrency !== undefined) args.toolCallConcurrency = settings.toolCallConcurrency;
    if (settings.strict !== undefined) args.strict = settings.strict;

    return args;
}

/**
 * 获取或初始化 agent 的 thinking 状态
 */
function getThinkingState(
    state: PacRunState,
    agentTraceNodeId: string,
): AgentThinkingState {
    let thinkingState = state.thinkingStates.get(agentTraceNodeId);
    if (!thinkingState) {
        thinkingState = {
            textStarted: false,
            reasoningCount: 0,
        };
        state.thinkingStates.set(agentTraceNodeId, thinkingState);
    }
    return thinkingState;
}

type StreamPhase = "idle" | "reasoning" | "text";

/**
 * 流式执行，捕获 thinking 和流式输出。
 *
 * **核心状态机（替代单一 textStarted 布尔）**：
 *
 *   idle      —— 初始 / 工具调用后 / text-end 后。此阶段到达的 text-delta 视为"裸 delta"，
 *                按思考处理（防御 provider 把思考标记为 text-delta 且不发 reasoning-start）。
 *   reasoning —— reasoning-start 后。此阶段到达的 text-delta 也按思考处理。
 *   text      —— text-start 后。只有此阶段到达的 text-delta 才进入正文通道。
 *
 * **AI SDK v7 事件顺序（期望）**：
 *   1. reasoning-start / reasoning-delta / reasoning-end  （可选，可能多轮）
 *   2. text-start / text-delta / text-end                 （正文块）
 *   3. tool-input-start → tool-call → tool-result/error   （工具调用）
 *   4. 工具后回到 1 或 2
 *
 * 关键修复：
 * - tool-call / tool-input-start 时关闭当前 reasoning 并回到 idle；
 * - 非 text phase 的 text-delta 不进 message / output 正文；
 * - 子 agent 的最终文本只由 phase === "text" 的 delta 拼成，确保返回正文。
 *
 * **ID 策略**：对外全部 UUID，由 `state.idRegistry` 从内部语义键派生；内部键不落库。
 * **持久化**：所有 prjdb 写入受 `state.persist` 控制；ctx.report 事件不受影响。
 */
export async function streamAgent(
    agent: AnyToolLoopAgent,
    messages: ModelMessage[],
    ctx: IRunnerContext,
    settings: ResolvedSettings,
    state: PacRunState,
    agentTraceNodeId: string,
    deltaBuffer: MessageDeltaBuffer,
    prjdb: PrjDB,
    streamToMessage: boolean,
    needOutputNode: boolean,
    onNodeIds: (reasoningId: string | undefined, outputId: string | undefined) => void,
): Promise<StreamResult> {
    const res = await agent.stream(buildCallArgs(messages, ctx, settings) as never);
    const textBuf: string[] = [];
    let outputNodeId: string | undefined;
    let outputStartedAt: number | undefined;

    const thinkingState = getThinkingState(state, agentTraceNodeId);
    // 父内部键：用于派生 reasoning / output 子节点的内部键。
    const parentInternalKey =
        state.idRegistry.internalKeyOf(agentTraceNodeId) ?? agentTraceNodeId;

    let phase: StreamPhase = "idle";

    const closeReasoning = (status: "success" | "error" = "success") => {
        if (!thinkingState.currentReasoningNodeId) return;
        const now = Date.now();
        const id = thinkingState.currentReasoningNodeId;
        const startedAt = thinkingState.currentReasoningStartedAt;
        const patch = {
            status,
            finishedAt: now,
            ...(startedAt !== undefined
                ? { description: `耗时: ${formatDurationMs(now - startedAt)}` }
                : {}),
        };
        if (state.persist) {
            prjdb.patchTrace(id, patch);
        }
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: id,
            patch,
        } as TraceStreamEvent);
        thinkingState.currentReasoningNodeId = undefined;
        thinkingState.currentReasoningStartedAt = undefined;
    };

    const ensureReasoningNode = () => {
        if (thinkingState.currentReasoningNodeId) return;
        const reasoningInternalKey =
            `${parentInternalKey}:reasoning:${thinkingState.reasoningCount}`;
        thinkingState.currentReasoningNodeId =
            state.idRegistry.getOrCreate(reasoningInternalKey);
        thinkingState.currentReasoningStartedAt = Date.now();

        const node = {
            id: thinkingState.currentReasoningNodeId,
            kind: "reasoning" as const,
            status: "running" as const,
            title: thinkingState.reasoningCount > 1
                ? `思考 #${thinkingState.reasoningCount}`
                : "思考",
            detail: "",
            streaming: true,
        };
        if (state.persist) {
            prjdb.upsertTrace(state.messageId, agentTraceNodeId, node);
        }
        ctx.report({
            type: "trace.start",
            messageId: state.messageId,
            parentId: agentTraceNodeId,
            node,
        } as TraceStreamEvent);
    };

    const appendReasoning = (delta: string) => {
        if (!delta) return;
        ensureReasoningNode();
        const id = thinkingState.currentReasoningNodeId!;
        if (state.persist) {
            prjdb.appendTraceDetail(id, delta);
        }
        ctx.report({
            type: "trace.detail.delta",
            messageId: state.messageId,
            nodeId: id,
            delta,
        } as TraceStreamEvent);
    };

    const ensureOutputNode = () => {
        if (outputNodeId || !needOutputNode) return;
        outputNodeId = state.idRegistry.getOrCreate(`${parentInternalKey}:output`);
        outputStartedAt = Date.now();
        const outputNode = {
            id: outputNodeId,
            kind: "output" as const,
            status: "running" as const,
            title: "输出",
            detail: "",
            streaming: true,
        };
        if (state.persist) {
            prjdb.upsertTrace(state.messageId, agentTraceNodeId, outputNode);
        }
        ctx.report({
            type: "trace.start",
            messageId: state.messageId,
            parentId: agentTraceNodeId,
            node: outputNode,
        } as TraceStreamEvent);
    };

    const appendText = (delta: string) => {
        if (!delta) return;
        textBuf.push(delta);
        // 只有根 agent 的正文才进入 message delta buffer。
        // 子 agent 的正文只应写自己的 output trace，绝不能写回根 assistant message。
        if (streamToMessage) {
            deltaBuffer.push(delta);
        }
        ensureOutputNode();

        if (streamToMessage) {
            ctx.report({
                type: "message.delta",
                messageId: state.messageId,
                delta,
            } as MessageStreamEvent);
        } else if (outputNodeId) {
            if (state.persist) {
                prjdb.appendTraceDetail(outputNodeId, delta);
            }
            ctx.report({
                type: "trace.detail.delta",
                messageId: state.messageId,
                nodeId: outputNodeId,
                delta,
            } as TraceStreamEvent);
        } else {
            Logger.warn(
                `[PAC][${agentTraceNodeId}] text-delta 无目标通道 ` +
                `(streamToMessage=${streamToMessage}, needOutputNode=${needOutputNode}, ` +
                `outputNodeId=${outputNodeId})`,
            );
        }
    };

    try {
        for await (const part of res.stream) {
            if (ctx.isAborted) break;

            if (part.type === "reasoning-start") {
                thinkingState.reasoningCount++;
                closeReasoning();
                phase = "reasoning";
                Logger.debug(
                    `[PAC][${agentTraceNodeId}] reasoning-start #${thinkingState.reasoningCount}`,
                );
                continue;
            }

            if (part.type === "reasoning-delta") {
                if (phase !== "reasoning") {
                    // 没有 reasoning-start 但收到 reasoning-delta：进入新思考轮次
                    closeReasoning();
                    thinkingState.reasoningCount++;
                    phase = "reasoning";
                }
                appendReasoning(part.text);
                continue;
            }

            if (part.type === "reasoning-end") {
                // 不立即关闭；等 text-start 或下一个 reasoning-start 收口，
                // 避免 provider 在 reasoning-end 后仍继续发 reasoning-delta 的异常情况。
                Logger.debug(
                    `[PAC][${agentTraceNodeId}] reasoning-end #${thinkingState.reasoningCount}`,
                );
                continue;
            }

            if (part.type === "text-start") {
                closeReasoning();
                phase = "text";
                Logger.debug(`[PAC][${agentTraceNodeId}] text-start`);
                continue;
            }

            if (part.type === "text-end") {
                phase = "idle";
                continue;
            }

            // 工具调用：结束当前 reasoning，回到 idle。
            // 兼容不同 SDK 版本的起始事件名，避免重置时机丢失。
            if (part.type === "tool-call" || part.type === "tool-input-start") {
                closeReasoning();
                phase = "idle";
                continue;
            }

            if (part.type === "tool-result" || part.type === "tool-error") {
                // 工具结果不改变 phase：保持 idle，等待下一个 reasoning-start / text-start
                phase = "idle";
                continue;
            }

            if (part.type === "text-delta") {
                const delta = part.text;
                if (!delta) continue;

                if (phase === "text") {
                    appendText(delta);
                } else if (phase === "reasoning") {
                    // SDK/模型把思考错标为 text-delta：追加到 reasoning，不进正文
                    Logger.debug(
                        `[PAC][${agentTraceNodeId}] text-delta 在 reasoning phase，按思考处理 ` +
                        `(length=${delta.length})`,
                    );
                    appendReasoning(delta);
                } else {
                    // idle：工具后/初始的裸 text-delta，按思考处理，绝不进 message
                    Logger.debug(
                        `[PAC][${agentTraceNodeId}] text-delta 在 idle phase，按思考处理 ` +
                        `(length=${delta.length})`,
                    );
                    thinkingState.reasoningCount++;
                    phase = "reasoning";
                    appendReasoning(delta);
                }
                continue;
            }
        }
    } catch (e) {
        Logger.warn(`[PAC][${agentTraceNodeId}] stream 处理失败:`, e);
        closeReasoning("error");
        throw e;
    }

    // 正常结束或中断后收口 reasoning
    closeReasoning(ctx.isAborted ? "error" : "success");

    // 最终文本：只用 phase === "text" 收集到的正文。
    // res.text 仅当 textBuf 为空时兜底（例如 provider 完全不发 text-start 的极端情况）。
    const sdkText = await res.text;
    const text = textBuf.length > 0 ? textBuf.join("") : (sdkText ?? "");
    const usage = await res.usage;

    const now = Date.now();
    if (outputNodeId && !ctx.isAborted) {
        const patch = {
            status: "success" as const,
            finishedAt: now,
            ...(outputStartedAt !== undefined
                ? { description: `耗时: ${formatDurationMs(now - outputStartedAt)}` }
                : {}),
        };
        if (state.persist) {
            prjdb.patchTrace(outputNodeId, patch);
        }
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: outputNodeId,
            patch,
        } as TraceStreamEvent);
    }

    // reasoning 已在 closeReasoning 中收口，这里对 agentCtx 传 undefined，
    // 避免 handleAbort/handleFailure 重复处理已关闭节点。
    onNodeIds(undefined, outputNodeId);
    return { text, usage };
}

/**
 * 非流式执行，无法捕获 thinking 和增量输出。
 */
export async function generateAgent(
    agent: AnyToolLoopAgent,
    messages: ModelMessage[],
    ctx: IRunnerContext,
    settings: ResolvedSettings,
): Promise<StreamResult> {
    const result = await agent.generate(buildCallArgs(messages, ctx, settings) as never);
    const text = (result as { text?: string }).text ?? "";
    const usage =
        (result as { totalUsage?: unknown; usage?: unknown }).totalUsage ??
        (result as { usage?: unknown }).usage;
    return { text, usage };
}