// packages/main/src/libs/blueprint/capability/local/agent/executor.ts

import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { MessageStreamEvent, TraceStreamEvent } from "$types/shared/chat.js";
import type { ModelMessage, ToolLoopAgent } from "ai";
import Logger from "electron-log/main.js";
import { reasoningTraceId } from "../traceid.js";
import type { PacTimeoutConfig } from "../type.js";
import { MessageDeltaBuffer } from "./buffer.js";
import type { GenerateCallArgs, PacRunState, StreamResult } from "./types.js";

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
 * 流式执行，捕获 thinking 和流式输出。
 *
 * **关键决策**: Reasoning 和 Output 节点在 stream 完全结束后才关闭。
 *
 * **理由**:
 * 1. AI SDK 没有显式的 reasoning 结束事件
 * 2. reasoning-delta 和 text-delta 可以交错出现
 * 3. 正确性优先：绝不能让 reasoning 内容泄露到其它通道
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
    let reasoningNodeId: string | undefined;
    let outputNodeId: string | undefined;

    try {
        for await (const part of res.stream) {
            if (ctx.isAborted) break;

            if (part.type === "reasoning-delta") {
                const thinkDelta = part.text;
                if (thinkDelta) {
                    if (!reasoningNodeId) {
                        reasoningNodeId = reasoningTraceId(agentTraceNodeId);
                        const node = {
                            id: reasoningNodeId,
                            kind: "reasoning" as const,
                            status: "running" as const,
                            title: "思考",
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
                    prjdb.appendTraceDetail(reasoningNodeId, thinkDelta);
                    ctx.report({
                        type: "trace.detail.delta",
                        messageId: state.messageId,
                        nodeId: reasoningNodeId,
                        delta: thinkDelta,
                    } as TraceStreamEvent);
                }
            } else if (part.type === "text-delta") {
                const delta = part.text;
                textBuf.push(delta);
                deltaBuffer.push(delta);

                // 延迟创建 output 节点（第一个 text-delta 到达时）
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
                }
            }
        }
    } catch (e) {
        Logger.warn("[PAC] stream 处理失败:", e);
        throw e;
    }

    const text = (await res.text) ?? textBuf.join("");
    const usage = await res.usage;

    // Stream 完全结束后，关闭所有节点
    if (reasoningNodeId) {
        prjdb.patchTrace(reasoningNodeId, {
            status: "success",
            finishedAt: Date.now(),
        });
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: reasoningNodeId,
        } as TraceStreamEvent);
    }

    if (outputNodeId) {
        prjdb.patchTrace(outputNodeId, {
            status: "success",
            finishedAt: Date.now(),
        });
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: outputNodeId,
        } as TraceStreamEvent);
    }

    onNodeIds(reasoningNodeId, outputNodeId);
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