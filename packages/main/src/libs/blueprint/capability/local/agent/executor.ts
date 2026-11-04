// packages/main/src/libs/blueprint/capability/local/agent/executor.ts

import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { MessageStreamEvent, TraceStreamEvent } from "$types/shared/chat.js";
import type { ModelMessage, ToolLoopAgent } from "ai";
import Logger from "electron-log/main.js";
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
 * **ID 策略**:
 * - 对外的所有节点 ID 都是 UUID,由 `state.idRegistry` 从内部语义键派生.
 * - 本函数通过父 UUID 反查内部键,再拼接 `:reasoning:${count}` / `:output` 得到子内部键.
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

    const thinkingState = getThinkingState(state, agentTraceNodeId);
    // 父内部键:用于派生 reasoning / output 子节点的内部键.
    // 反查失败时退化为 UUID 本身,仍然能产出全新的、不冲突的 UUID.
    const parentInternalKey =
        state.idRegistry.internalKeyOf(agentTraceNodeId) ?? agentTraceNodeId;

    try {
        for await (const part of res.stream) {
            if (ctx.isAborted) break;

            // 检测 reasoning-start 事件（重新进入 thinking 状态）
            if (part.type === "reasoning-start") {
                thinkingState.reasoningCount++;

                if (thinkingState.textStarted) {
                    Logger.debug(
                        `[PAC][${agentTraceNodeId}] reasoning-start #${thinkingState.reasoningCount} 到达，` +
                        `重新进入思考状态 (重置 textStarted: true → false)`,
                    );
                    thinkingState.textStarted = false;

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

            // 检测 text-start 事件
            if (part.type === "text-start") {
                thinkingState.textStarted = true;
                Logger.debug(`[PAC][${agentTraceNodeId}] text-start 事件到达，思考结束，正文开始`);

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
                        // 用 count 做为内部键后缀,保证本次 run 内 reasoning 节点互不冲突;
                        // 跨 run 则由 idRegistry 实例隔离,产出不同 UUID.
                        const reasoningInternalKey =
                            `${parentInternalKey}:reasoning:${thinkingState.reasoningCount}`;
                        thinkingState.currentReasoningNodeId =
                            state.idRegistry.getOrCreate(reasoningInternalKey);

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
                Logger.debug(
                    `[PAC][${agentTraceNodeId}] text-delta 到达 ` +
                    `(textStarted=${thinkingState.textStarted}, ` +
                    `reasoningCount=${thinkingState.reasoningCount}, ` +
                    `streamToMessage=${streamToMessage}, ` +
                    `length=${delta.length})`,
                );
                if (!thinkingState.textStarted) {
                    Logger.debug(
                        `[PAC][${agentTraceNodeId}] 丢弃 text-start 之前的 text-delta ` +
                        `(reasoning #${thinkingState.reasoningCount}, thinking 内容, length=${delta.length})`,
                    );
                    continue;
                }

                // 延迟创建 output 节点(第一个正文 text-delta 到达时)
                if (!outputNodeId && needOutputNode) {
                    outputNodeId = state.idRegistry.getOrCreate(
                        `${parentInternalKey}:output`,
                    );
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
                    ctx.report({
                        type: "message.delta",
                        messageId: state.messageId,
                        delta,
                    } as MessageStreamEvent);
                } else if (outputNodeId) {
                    prjdb.appendTraceDetail(outputNodeId, delta);
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
            }
        }
    } catch (e) {
        Logger.warn(`[PAC][${agentTraceNodeId}] stream 处理失败:`, e);
        throw e;
    }

    const text = (await res.text) ?? textBuf.join("");
    const usage = await res.usage;

    const now = Date.now();

    if (thinkingState.currentReasoningNodeId && !thinkingState.textStarted) {
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