// packages/main/src/libs/blueprint/capability/local/agent/lifecycle.ts

import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { AgentIdentity, MessageStreamEvent, TraceStreamEvent } from "$types/shared/chat.js";
import type { PacRunState } from "./types.js";

export interface AgentContext {
    agentTraceNodeId: string;
    agentIdentity: AgentIdentity;
    inputNodeId?: string;
    reasoningNodeId?: string;
    outputNodeId?: string;
}

export function startRootMessage(
    ctx: IRunnerContext,
    state: PacRunState,
    agentIdentity: AgentIdentity,
): void {
    const evt: MessageStreamEvent = {
        type: "message.start",
        messageId: state.messageId,
        sessionId: ctx.sessId,
        timestamp: Date.now(),
        agent: agentIdentity,
    };
    ctx.report(evt);
}

export function startAgentTrace(
    ctx: IRunnerContext,
    prjdb: PrjDB,
    state: PacRunState,
    agentTraceNodeId: string,
    agentName: string,
    modelInfo: { providerId: string; modelId: string },
    agentIdentity: AgentIdentity,
    parentTraceId: string | undefined,
): void {
    const node = {
        id: agentTraceNodeId,
        kind: "agent" as const,
        status: "running" as const,
        title: agentName,
        description: `模型: ${modelInfo.providerId}/${modelInfo.modelId}`,
        agent: agentIdentity,
        children: [],
        streaming: true,
    };

    if (state.persist) {
        prjdb.upsertTrace(state.messageId, parentTraceId ?? null, node);
    }

    ctx.report({
        type: "trace.start",
        messageId: state.messageId,
        parentId: parentTraceId,
        node,
    } as TraceStreamEvent);
}

export function createInputNode(
    ctx: IRunnerContext,
    prjdb: PrjDB,
    state: PacRunState,
    agentTraceNodeId: string,
    inputs: Record<string, unknown>,
): string {
    // 通过父 UUID 反查内部键,再派生 input 子键;若反查不到,退化为 UUID 本身,
    // 结果仍是全新的 UUID,保证跨 run 唯一.
    const parentInternalKey =
        state.idRegistry.internalKeyOf(agentTraceNodeId) ?? agentTraceNodeId;
    const inputNodeId = state.idRegistry.getOrCreate(`${parentInternalKey}:input`);

    const now = Date.now();
    const node = {
        id: inputNodeId,
        kind: "input" as const,
        status: "success" as const,
        title: "输入",
        detail: JSON.stringify(inputs, null, 2),
        streaming: false,
        finishedAt: now,
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

    // input 节点瞬间完成，立即发送 end
    ctx.report({
        type: "trace.end",
        messageId: state.messageId,
        nodeId: inputNodeId,
        patch: {
            status: "success",
            finishedAt: now,
        },
    } as TraceStreamEvent);

    return inputNodeId;
}

export function handleAbort(
    ctx: IRunnerContext,
    prjdb: PrjDB,
    state: PacRunState,
    agentCtx: AgentContext,
    stepPath: string,
    agentName: string,
    isRoot: boolean,
): void {
    ctx.debug(`[PAC][step=${stepPath}] ${agentName} 已中断`);

    const now = Date.now();

    if (agentCtx.reasoningNodeId) {
        if (state.persist) {
            prjdb.patchTrace(agentCtx.reasoningNodeId, {
                status: "error",
                finishedAt: now,
            });
        }
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: agentCtx.reasoningNodeId,
            patch: {
                status: "error",
                finishedAt: now,
            },
        } as TraceStreamEvent);
    }

    if (agentCtx.outputNodeId) {
        if (state.persist) {
            prjdb.patchTrace(agentCtx.outputNodeId, {
                status: "error",
                finishedAt: now,
            });
        }
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: agentCtx.outputNodeId,
            patch: {
                status: "error",
                finishedAt: now,
            },
        } as TraceStreamEvent);
    }

    if (state.persist) {
        prjdb.patchTrace(agentCtx.agentTraceNodeId, {
            status: "error",
            finishedAt: now,
            description: "已中断",
        });
    }

    ctx.report({
        type: "trace.end",
        messageId: state.messageId,
        nodeId: agentCtx.agentTraceNodeId,
        patch: {
            status: "error",
            finishedAt: now,
            description: "已中断",
        },
    } as TraceStreamEvent);

    if (isRoot) {
        ctx.report({
            type: "message.end",
            messageId: state.messageId,
            content: "",
        } as MessageStreamEvent);
    }
}

export function handleFailure(
    ctx: IRunnerContext,
    prjdb: PrjDB,
    state: PacRunState,
    agentCtx: AgentContext,
    failure: unknown,
): void {
    const now = Date.now();

    if (agentCtx.reasoningNodeId) {
        if (state.persist) {
            prjdb.patchTrace(agentCtx.reasoningNodeId, {
                status: "error",
                finishedAt: now,
            });
        }
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: agentCtx.reasoningNodeId,
            patch: {
                status: "error",
                finishedAt: now,
            },
        } as TraceStreamEvent);
    }

    if (agentCtx.outputNodeId) {
        if (state.persist) {
            prjdb.patchTrace(agentCtx.outputNodeId, {
                status: "error",
                finishedAt: now,
            });
        }
        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: agentCtx.outputNodeId,
            patch: {
                status: "error",
                finishedAt: now,
            },
        } as TraceStreamEvent);
    }

    const errMsg = String(failure instanceof Error ? failure.message : failure);

    if (state.persist) {
        prjdb.patchTrace(agentCtx.agentTraceNodeId, {
            status: "error",
            finishedAt: now,
            description: `错误: ${errMsg}`,
        });
    }

    ctx.report({
        type: "trace.end",
        messageId: state.messageId,
        nodeId: agentCtx.agentTraceNodeId,
        patch: {
            status: "error",
            finishedAt: now,
            description: `错误: ${errMsg}`,
        },
    } as TraceStreamEvent);
}

export function finishAgentTrace(
    ctx: IRunnerContext,
    prjdb: PrjDB,
    state: PacRunState,
    agentTraceNodeId: string,
): void {
    const now = Date.now();

    if (state.persist) {
        prjdb.patchTrace(agentTraceNodeId, {
            status: "success",
            finishedAt: now,
        });
    }

    ctx.report({
        type: "trace.end",
        messageId: state.messageId,
        nodeId: agentTraceNodeId,
        patch: {
            status: "success",
            finishedAt: now,
        },
    } as TraceStreamEvent);
}

export function finishRootMessage(
    ctx: IRunnerContext,
    prjdb: PrjDB,
    state: PacRunState,
    finalText: string,
    usage: unknown,
    agentIdentity: AgentIdentity,
    failure: unknown,
): void {
    if (failure) {
        ctx.report({
            type: "message.error",
            messageId: state.messageId,
            error: String(failure instanceof Error ? failure.message : failure),
        } as MessageStreamEvent);
    } else {
        ctx.report({
            type: "message.end",
            messageId: state.messageId,
            content: finalText,
            meta: usage ? { usage } : undefined,
        } as MessageStreamEvent);
    }

    if (state.persist) {
        prjdb.finishMessage(state.messageId, {
            content: finalText,
            isError: !!failure,
            agent: agentIdentity,
        });
    }
}