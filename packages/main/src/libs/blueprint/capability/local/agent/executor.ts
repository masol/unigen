// packages/main/src/libs/blueprint/capability/local/agent/executor.ts

import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { MessageStreamEvent, TraceStreamEvent } from "$types/shared/chat.js";
import type { ModelMessage, ToolLoopAgent } from "ai";
import Logger from "electron-log/main.js";
import { reasoningTraceId } from "../traceid.js";
import type { PacTimeoutConfig } from "../type.js";
import { MessageDeltaBuffer } from "./buffer.js";
import type { AgentThinkingState, GenerateCallArgs, PacRunState, StreamResult } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolLoopAgent = ToolLoopAgent<any, any, any, any>;

export function buildCallArgs(
    messages: ModelMessage[],
    ctx: IRunnerContext,
    timeout: PacTimeoutConfig | undefined,
): GenerateCallArgs {
    const args: GenerateCallArgs = {
        messages,
        abortSignal: ctx.signal,
        timeout,
    };
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

/**
 * 流式执行，捕获 thinking 和流式输出。
 *
 * **关键决策**: 使用 AI SDK v7 的 `text-start` 事件作为 thinking 结束的权威信号。
 *
 * **事件顺序**:
 * 1. reasoning-start (可选) ← **重要**：可能多次出现（工具调用后重新思考）
 * 2. reasoning-delta (多次)
 * 3. reasoning-end (可选，某些 provider 不发送)
 * 4. text-start ← **关键**：思考结束，正文开始
 * 5. text-delta (多次)
 * 6. [工具调用] → 可能回到步骤 1
 *
 * **状态管理** (✅ 并发安全):
 * - 状态存储在 `state.thinkingStates[agentTraceNodeId]` 中
 * - 每个 agent（包括并行的子 agent）有独立的状态
 * - `reasoning-start` 到达 → 重置 `textStarted = false`（进入新的 thinking 阶段）
 * - `text-start` 到达 → 设置 `textStarted = true`（thinking 结束）
 *
 * **通道隔离**:
 * - 在 `text-start` 之前的所有 `text-delta` 都是 thinking 内容，丢弃
 * - 在 `text-start` 之后的所有 `text-delta` 是正文内容，按通道发送
 *
 * @param streamToMessage - true: 根 agent，文本 delta 发送到 message 通道
 * @param needOutputNode - true: 子 agent，需要创建 output 节点
 * @param onNodeIds - 回调，用于返回创建的 reasoning 和 output 节点 ID
 */
export async function streamAgent(
    agent: AnyToolLoopAgent,
    messages: ModelMessage[],
    ctx: IRunnerContext,
    timeout: PacTimeoutConfig | undefined,
    state: PacRunState,
    agentTraceNodeId: string,
    deltaBuffer: MessageDeltaBuffer,
    prjdb: PrjDB,
    streamToMessage: boolean,
    needOutputNode: boolean,
    onNodeIds: (reasoningId: string | undefined, outputId: string | undefined) => void,
): Promise<StreamResult> {
    const res = await agent.stream(buildCallArgs(messages, ctx, timeout) as never);
    const textBuf: string[] = [];
    let outputNodeId: string | undefined;

    // ✅ 关键修正：从共享状态中读取 thinking 状态
    const thinkingState = getThinkingState(state, agentTraceNodeId);

    try {
        for await (const part of res.stream) {
            if (ctx.isAborted) break;

            // ✅ 检测 reasoning-start 事件（重新进入 thinking 状态）
            if (part.type === "reasoning-start") {
                thinkingState.reasoningCount++;

                // ✅ 关键修正：重置 textStarted 标志
                if (thinkingState.textStarted) {
                    Logger.debug(
                        `[PAC][${agentTraceNodeId}] reasoning-start #${thinkingState.reasoningCount} 到达，` +
                        `重新进入思考状态 (重置 textStarted: true → false)`,
                    );
                    thinkingState.textStarted = false;

                    // 关闭上一个 reasoning 节点（如果存在且未关闭）
                    if (thinkingState.currentReasoningNodeId) {
                        const now = Date.now();
                        prjdb.patchTrace(thinkingState.currentReasoningNodeId, {
                            status: "success",
                            finishedAt: now,
                        });
                        ctx.report({
                            type: "trace.end",
                            messageId: state.messageId,
                            nodeId: thinkingState.currentReasoningNodeId,
                            patch: {
                                status: "success",
                                finishedAt: now,
                            },
                        } as TraceStreamEvent);
                        thinkingState.currentReasoningNodeId = undefined;
                    }
                } else {
                    Logger.debug(
                        `[PAC][${agentTraceNodeId}] reasoning-start #${thinkingState.reasoningCount} 到达，开始思考`,
                    );
                }
                continue;
            }

            // ✅ 检测 text-start 事件
            if (part.type === "text-start") {
                thinkingState.textStarted = true;
                Logger.debug(`[PAC][${agentTraceNodeId}] text-start 事件到达，思考结束，正文开始`);

                // 关闭 reasoning 节点（如果存在）
                if (thinkingState.currentReasoningNodeId) {
                    const now = Date.now();
                    prjdb.patchTrace(thinkingState.currentReasoningNodeId, {
                        status: "success",
                        finishedAt: now,
                    });
                    ctx.report({
                        type: "trace.end",
                        messageId: state.messageId,
                        nodeId: thinkingState.currentReasoningNodeId,
                        patch: {
                            status: "success",
                            finishedAt: now,
                        },
                    } as TraceStreamEvent);
                    thinkingState.currentReasoningNodeId = undefined;
                }
                continue;
            }

            if (part.type === "reasoning-end") {
                Logger.debug(
                    `[PAC][${agentTraceNodeId}] reasoning-end 事件到达 ` +
                    `(reasoning #${thinkingState.reasoningCount})（注意：text-start 才是权威信号）`,
                );
                continue;
            }

            if (part.type === "reasoning-delta") {
                const thinkDelta = part.text;
                if (thinkDelta) {
                    if (!thinkingState.currentReasoningNodeId) {
                        // 为多次 reasoning 生成唯一 ID
                        const suffix = thinkingState.reasoningCount > 1 ? `_${thinkingState.reasoningCount}` : "";
                        thinkingState.currentReasoningNodeId = `${reasoningTraceId(agentTraceNodeId)}${suffix}`;

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
                        prjdb.upsertTrace(state.messageId, agentTraceNodeId, node);

                        ctx.report({
                            type: "trace.start",
                            messageId: state.messageId,
                            parentId: agentTraceNodeId,
                            node,
                        } as TraceStreamEvent);
                    }
                    prjdb.appendTraceDetail(thinkingState.currentReasoningNodeId, thinkDelta);
                    ctx.report({
                        type: "trace.detail.delta",
                        messageId: state.messageId,
                        nodeId: thinkingState.currentReasoningNodeId,
                        delta: thinkDelta,
                    } as TraceStreamEvent);
                }
                continue;
            }

            if (part.type === "text-delta") {
                const delta = part.text;
                textBuf.push(delta);
                deltaBuffer.push(delta);
                // 添加详细日志
                Logger.debug(
                    `[PAC][${agentTraceNodeId}] text-delta 到达 ` +
                    `(textStarted=${thinkingState.textStarted}, ` +
                    `reasoningCount=${thinkingState.reasoningCount}, ` +
                    `streamToMessage=${streamToMessage}, ` +
                    `length=${delta.length})`,
                );
                // text-start 之前的 text-delta 是 thinking 内容，丢弃
                if (!thinkingState.textStarted) {
                    Logger.debug(
                        `[PAC][${agentTraceNodeId}] 丢弃 text-start 之前的 text-delta ` +
                        `(reasoning #${thinkingState.reasoningCount}, thinking 内容, length=${delta.length})`,
                    );
                    continue;
                }

                // text-start 之后的 text-delta 是正文内容，正常处理

                // 延迟创建 output 节点（第一个正文 text-delta 到达时）
                if (!outputNodeId && needOutputNode) {
                    outputNodeId = `${agentTraceNodeId}:output`;
                    const outputNode = {
                        id: outputNodeId,
                        kind: "output" as const,
                        status: "running" as const,
                        title: "输出",
                        detail: "",
                        streaming: true,
                    };
                    prjdb.upsertTrace(state.messageId, agentTraceNodeId, outputNode);
                    ctx.report({
                        type: "trace.start",
                        messageId: state.messageId,
                        parentId: agentTraceNodeId,
                        node: outputNode,
                    } as TraceStreamEvent);
                }

                if (streamToMessage) {
                    // ✅ 根 agent: 发送到 message 通道
                    ctx.report({
                        type: "message.delta",
                        messageId: state.messageId,
                        delta,
                    } as MessageStreamEvent);
                } else if (outputNodeId) {
                    // ✅ 子 agent: 发送到 output 节点的 detail（trace 通道）
                    prjdb.appendTraceDetail(outputNodeId, delta);
                    ctx.report({
                        type: "trace.detail.delta",
                        messageId: state.messageId,
                        nodeId: outputNodeId,
                        delta,
                    } as TraceStreamEvent);
                } else {
                    // ⚠️ 异常情况：text-delta 在 text-start 之后，但没有 output 节点
                    Logger.warn(
                        `[PAC][${agentTraceNodeId}] text-delta 无目标通道 ` +
                        `(streamToMessage=${streamToMessage}, needOutputNode=${needOutputNode}, ` +
                        `outputNodeId=${outputNodeId})`,
                    );
                }
            }
        }
    } catch (e) {
        Logger.warn(`[PAC][${agentTraceNodeId}] stream 处理失败:`, e);
        throw e;
    }

    const text = (await res.text) ?? textBuf.join("");
    const usage = await res.usage;

    const now = Date.now();

    // Stream 完全结束后，关闭剩余节点
    if (thinkingState.currentReasoningNodeId && !thinkingState.textStarted) {
        // 如果 text-start 未到达（异常情况），关闭 reasoning 节点
        prjdb.patchTrace(thinkingState.currentReasoningNodeId, {
            status: "success",
            finishedAt: now,
        });
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: thinkingState.currentReasoningNodeId,
            patch: {
                status: "success",
                finishedAt: now,
            },
        } as TraceStreamEvent);
    }

    if (outputNodeId) {
        prjdb.patchTrace(outputNodeId, {
            status: "success",
            finishedAt: now,
        });
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: outputNodeId,
            patch: {
                status: "success",
                finishedAt: now,
            },
        } as TraceStreamEvent);
    }

    onNodeIds(thinkingState.currentReasoningNodeId, outputNodeId);
    return { text, usage };
}

/**
 * 非流式执行，无法捕获 thinking 和增量输出。
 */
export async function generateAgent(
    agent: AnyToolLoopAgent,
    messages: ModelMessage[],
    ctx: IRunnerContext,
    timeout: PacTimeoutConfig | undefined,
): Promise<StreamResult> {
    const result = await agent.generate(buildCallArgs(messages, ctx, timeout) as never);
    const text = (result as { text?: string }).text ?? "";
    const usage =
        (result as { totalUsage?: unknown; usage?: unknown }).totalUsage ??
        (result as { usage?: unknown }).usage;
    return { text, usage };
}