// packages/main/src/libs/blueprint/capability/local/agent/callbacks.ts

import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { TraceStreamEvent } from "$types/shared/chat.js";
import { nextSeq } from "../traceid.js";
import type { CompiledPacAgent } from "../type.js";
import type { PacRunState, ToolCallTraceInfo, ToolExecEndEvent, ToolExecStartEvent } from "./types.js";

export function createToolCallbacks(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    state: PacRunState,
    prjdb: PrjDB,
    agentTraceNodeId: string,
    stepPath: string,
    toolCallTraces: Map<string, ToolCallTraceInfo>,
) {
    const onToolExecutionStart = (e: ToolExecStartEvent) => {
        const key = e.toolCall.toolName;
        const ref = compiled.toolRefs.find((r) => r.key === key);

        if (ref?.agent) {
            // 子 agent 的 trace 生命周期由其自身在 execution.ts 中管理;
            // 这里保留一个记录项以便 onToolExecutionEnd 识别"这是子 agent, 跳过".
            // 注意: traceId 字段在后续流程中不会被消费,仅用于类型完备.
            // const agentId = ref.agent.id;
            // const seq = nextSeq(state.counters, `agent:${agentId}`);
            // const internalKey = `agent:${agentId}:${seq}`;
            // const traceId = state.idRegistry.getOrCreate(internalKey);
            // toolCallTraces.set(e.toolCall.toolCallId, {
            //     traceId,
            //     isAgent: true,
            // });
            return;
        }

        const toolSeq = nextSeq(state.counters, `tool:${key}`);
        const toolInternalKey = `tool:${key}:${toolSeq}`;
        const toolTraceNodeId = state.idRegistry.getOrCreate(toolInternalKey);
        toolCallTraces.set(e.toolCall.toolCallId, {
            traceId: toolTraceNodeId,
            isAgent: false,
        });

        const paramsDetail = `**参数：**\n\`\`\`json\n${JSON.stringify(e.toolCall.input, null, 2)}\n\`\`\``;

        const toolNode = {
            id: toolTraceNodeId,
            kind: "tool" as const,
            status: "running" as const,
            title: `调用工具: ${key}`,
            toolName: key,
            detail: paramsDetail,
            streaming: true,
        };
        prjdb.upsertTrace(state.messageId, agentTraceNodeId, toolNode);

        const toolStartEvt: TraceStreamEvent = {
            type: "trace.start",
            messageId: state.messageId,
            parentId: agentTraceNodeId,
            node: toolNode,
        };
        ctx.report(toolStartEvt);

        ctx.debug(`[PAC][step=${stepPath}] 工具执行开始 ${key}`, {
            toolCallId: e.toolCall.toolCallId,
            input: e.toolCall.input,
        });
    };

    const onToolExecutionEnd = (e: ToolExecEndEvent) => {
        const traceInfo = toolCallTraces.get(e.toolCall.toolCallId);
        if (!traceInfo || traceInfo.isAgent) return;

        const status =
            e.toolOutput.type === "tool-error" ? ("error" as const) : ("success" as const);
        const description =
            e.toolOutput.type === "tool-error"
                ? `错误: ${String(e.toolOutput.error ?? "未知错误")}`
                : `耗时: ${e.toolExecutionMs}ms`;

        const resultDetail = (() => {
            if (e.toolOutput.type === "tool-error") {
                return `\n\n**错误：**\n\`\`\`\n${String(e.toolOutput.error)}\n\`\`\``;
            } else {
                const output = e.toolOutput.output;
                const outputStr =
                    typeof output === "string" ? output : JSON.stringify(output, null, 2);
                return `\n\n**结果：**\n\`\`\`json\n${outputStr}\n\`\`\``;
            }
        })();

        prjdb.appendTraceDetail(traceInfo.traceId, resultDetail);

        prjdb.patchTrace(traceInfo.traceId, {
            status,
            finishedAt: Date.now(),
            description,
        });

        const toolEndEvt: TraceStreamEvent = {
            type: "trace.end",
            messageId: state.messageId,
            nodeId: traceInfo.traceId,
        };
        ctx.report(toolEndEvt);

        if (e.toolOutput.type === "tool-error") {
            ctx.debug(`[PAC][step=${stepPath}] 工具执行失败 ${e.toolCall.toolName}`, {
                toolCallId: e.toolCall.toolCallId,
                error: String(e.toolOutput.error),
            });
        } else {
            ctx.debug(`[PAC][step=${stepPath}] 工具执行完成 ${e.toolCall.toolName}`, {
                toolCallId: e.toolCall.toolCallId,
                durationMs: e.toolExecutionMs,
                output: e.toolOutput.output,
            });
        }
    };

    return { onToolExecutionStart, onToolExecutionEnd };
}