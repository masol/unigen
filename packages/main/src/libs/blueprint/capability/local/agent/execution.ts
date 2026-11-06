// packages/main/src/libs/blueprint/capability/local/agent/execution.ts

import { ConstUntitled } from "$libs/const.js";
import { getSmartModel } from "$libs/model/index.js";
import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { throwNotfound } from "$libs/utils/err.js";
import { truncate } from "$libs/utils/str.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { isStepCount, ToolLoopAgent, type ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import { isPlainObject } from "radashi";
import { resolveModelOptions } from "../settings.js";
import { buildUserPrompt, renderSystemPrompt } from "../template.js";
import { nextSeq } from "../traceid.js";
import type { CompiledPacAgent, JsonValue } from "../type.js";
import { MessageDeltaBuffer } from "./buffer.js";
import { createToolCallbacks } from "./callbacks.js";
import { generateAgent, streamAgent } from "./executor.js";
import { loadPriorMessages } from "./history.js";
import {
    createInputNode,
    finishAgentTrace,
    finishRootMessage,
    handleAbort,
    handleFailure,
    startAgentTrace,
    startRootMessage,
    type AgentContext,
} from "./lifecycle.js";
import { materializeTools } from "./tools.js";
import type {
    IAgentExecutor,
    McpClientCache,
    PacRunState,
    RunOptions,
    ToolCallTraceInfo,
} from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolLoopAgent = ToolLoopAgent<any, any, any, any>;

export interface ExecutionResult {
    text: string;
    usage: unknown;
}

export async function executeAgent(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    prjdb: PrjDB,
    rawInputs: Record<string, unknown>,
    inheritedDefaults: Record<string, JsonValue>,
    options: RunOptions,
    mcpClients: McpClientCache,
    state: PacRunState,
    agentExecutor: IAgentExecutor,
): Promise<ExecutionResult> {
    const { validateInputs = true, isRoot = false, stepPath = "1", parentTraceId } = options;

    if (ctx.isAborted) return { text: "", usage: undefined };

    // 1. 输入校验
    let inputs = rawInputs;
    if (validateInputs) {
        const parsed = compiled.inputSchema.safeParse(rawInputs);
        if (!parsed.success) {
            Logger.warn(
                `[PAC][step=${stepPath}] ${compiled.name} 输入校验失败(将以原值运行):`,
                {
                    issues: parsed.error.issues.map(
                        (i) => `${i.path.join(".") || "<root>"} ${i.message}`,
                    ),
                    received: rawInputs,
                },
            );
        } else {
            inputs = parsed.data as Record<string, unknown>;
        }
    }

    const effectiveDefaults: Record<string, JsonValue> = {
        ...inheritedDefaults,
        ...compiled.ownDefaults,
    };
    const settings = compiled.settings;
    const persist = state.persist;
    const shouldStream = isRoot ? settings.streaming : true;
    const histEnabled = settings.history !== 0;

    // 2. 模型选择
    const modelOptions = resolveModelOptions(ctx);
    const model = getSmartModel(modelOptions as never, ctx);
    const providerId = model?.provider ?? "unknown";
    const modelId = model?.modelId ?? "unknown";
    state.modelInfo = { providerId, modelId };

    // 3. Trace 初始化
    // 内部键用于本次 run 中跨函数稳定定位同一节点;对外一律使用注册表产出的 UUID.
    const agentSeq = nextSeq(state.counters, `agent:${compiled.id}`);
    const agentInternalKey = `agent:${compiled.id}:${agentSeq}`;
    const agentTraceNodeId = state.idRegistry.getOrCreate(agentInternalKey);
    const agentIdentity = {
        id: agentTraceNodeId,
        name: compiled.name,
        model: `${providerId}::${modelId}`,
    };

    const agentCtx: AgentContext = {
        agentTraceNodeId,
        agentIdentity,
    };

    if (isRoot) {
        // Root Agent 特殊处理：重写消息与历史记录
        const isRerun = ctx.mode === "rerun";
        const userMsgId = ctx.msgId;

        if (isRerun) {
            // Rerun: 截断历史，使用历史输入
            const histMsg = prjdb.getMessage(userMsgId);
            if (!histMsg || histMsg.role !== 'user') {
                throwNotfound(`无法加载id为${userMsgId}消息，或加载到的不是合法的用户消息。`)
            }

            ctx.setMode(histMsg.mode === 'cmd' ? 'cmd' : null);
            ctx.cmd.body = histMsg.content;

            // 合并式恢复：历史 args 作为基底，本次 rerun 已传入的 args 优先覆盖
            const histArgs = histMsg.extra?.args;
            const currentArgs = isPlainObject(ctx.cmd.args) ? ctx.cmd.args : {};
            if (isPlainObject(histArgs)) {
                ctx.cmd.args = { ...histArgs, ...currentArgs };
            }

            if (persist) {
                prjdb.deleteMessagesAfter(ctx.sessId, histMsg.timestamp);
            }
        } else {
            if (persist) {
                prjdb.updateSessionTitle(ctx.sessId, truncate(ctx.cmd?.body || ConstUntitled))
                const cmdArgs = isPlainObject(ctx.cmd?.args) ? ctx.cmd.args : undefined;
                prjdb.saveMessage({
                    id: userMsgId,
                    sessionId: ctx.sessId,
                    role: "user",
                    content: ctx.cmd?.body || "",
                    files: ctx.files || [],
                    timestamp: Date.now(),
                    mode: ctx.mode === "cmd" ? "cmd" : null,
                    extra: cmdArgs ? { args: cmdArgs } : {},
                });
            }
        }

        // 为 Root 创建助手消息记录 (若不存在)
        if (persist) {
            prjdb.saveMessage({
                id: state.messageId,
                sessionId: ctx.sessId,
                role: "assistant",
                content: "",
                timestamp: Date.now(),
                mode: ctx.mode === "cmd" ? "cmd" : null,
            });
        }

        startRootMessage(ctx, state, agentIdentity);
    }

    startAgentTrace(
        ctx,
        prjdb,
        state,
        agentTraceNodeId,
        compiled.name,
        { providerId, modelId },
        agentIdentity,
        parentTraceId,
    );

    if (!isRoot) {
        agentCtx.inputNodeId = createInputNode(ctx, prjdb, state, agentTraceNodeId, inputs);
    }

    // 4. 构建 messages
    const tools = await materializeTools(
        compiled,
        ctx,
        effectiveDefaults,
        mcpClients,
        stepPath,
        state,
        agentTraceNodeId,
        agentExecutor,
    );

    const system = await renderSystemPrompt(compiled, ctx, inputs, effectiveDefaults, isRoot);
    const userText = await buildUserPrompt(compiled, ctx, inputs, effectiveDefaults, isRoot);
    const userMessage: ModelMessage = { role: "user", content: userText };

    // 历史来自 PrjDB.messages,排除本轮两条占位 (当前 user / 正在生成的 assistant)
    const prior = await loadPriorMessages(
        ctx,
        compiled.id,
        settings.history,
        histEnabled,
        isRoot,
        [ctx.msgId, state.messageId],
    );
    const messages: ModelMessage[] = [...prior, userMessage];

    ctx.debug(
        `[PAC][step=${stepPath}] 进入 ${compiled.name} ` +
        `(isRoot=${isRoot}, tools=${Object.keys(tools).length}, shouldStream=${shouldStream}, ` +
        `reasoning=${settings.reasoning}, history=${prior.length}, ` +
        `maxSteps=${settings.maxSteps}, timeout=${JSON.stringify(settings.timeout)}, ` +
        `persist=${persist})`,
        { inputs },
    );

    Logger.debug(
        `[PAC][step=${stepPath}] run ${compiled.name} (isRoot=${isRoot})\n` +
        `────────── SYSTEM PROMPT ──────────\n${system}\n` +
        `────────── MESSAGES (${messages.length} total, last is current user) ──────────\n` +
        `${JSON.stringify(messages, null, 2)}\n` +
        `────────────────────────────────────`,
    );

    // 5. 构建 Agent
    // 顶层 reasoning 由 AI SDK 跨 provider 映射到原生推理等级，不再手写预算/effort。
    // Google 需要额外 includeThoughts 才会以 reasoning-delta 返回思考内容，
    // 属于 display 设置，与顶层 reasoning 组合使用（见 AI SDK reasoning 文档）。
    const providerOptions = settings.reasoning === "provider-default"
        ? undefined
        : { google: { thinkingConfig: { includeThoughts: true } } };

    const toolCallTraces = new Map<string, ToolCallTraceInfo>();
    const callbacks = createToolCallbacks(
        compiled,
        ctx,
        state,
        prjdb,
        agentTraceNodeId,
        stepPath,
        toolCallTraces,
    );

    const agent: AnyToolLoopAgent = new ToolLoopAgent({
        model,
        instructions: system,
        stopWhen: isStepCount(settings.maxSteps),
        tools,
        reasoning: settings.reasoning,
        ...(providerOptions !== undefined ? { providerOptions } : {}),
        ...(settings.temperature !== undefined ? { temperature: settings.temperature } : {}),
        ...(settings.maxOutputTokens !== undefined ? { maxOutputTokens: settings.maxOutputTokens } : {}),
        ...(settings.toolCallConcurrency !== undefined ? { toolCallConcurrency: settings.toolCallConcurrency } : {}),
        ...(settings.strict !== undefined ? { strict: settings.strict } : {}),
        onToolExecutionStart: callbacks.onToolExecutionStart,
        onToolExecutionEnd: callbacks.onToolExecutionEnd,
        onError: (ev: { error: unknown }) => {
            Logger.warn(`[PAC][step=${stepPath}] ${compiled.name} agent 内部错误:`, ev.error);
        },
    } as never);

    // 6. 执行
    let finalText = "";
    let usage: unknown = undefined;
    let failure: unknown = undefined;
    const deltaBuffer = new MessageDeltaBuffer();

    try {
        if (shouldStream) {
            let streamSuccess = false;
            try {
                const r = await streamAgent(
                    agent,
                    messages,
                    ctx,
                    settings,
                    state,
                    agentTraceNodeId,
                    deltaBuffer,
                    prjdb,
                    isRoot,
                    !isRoot,
                    (reasoningId, outputId) => {
                        agentCtx.reasoningNodeId = reasoningId;
                        agentCtx.outputNodeId = outputId;
                    },
                );
                finalText = r.text;
                usage = r.usage;
                streamSuccess = true;
            } catch (streamErr) {
                Logger.warn(
                    `[PAC][step=${stepPath}] 流式执行失败，fallback 到非流式:`,
                    streamErr,
                );
            }

            if (!streamSuccess) {
                const r = await generateAgent(agent, messages, ctx, settings);
                finalText = r.text;
                usage = r.usage;

                if (!isRoot && finalText) {
                    const now = Date.now();
                    agentCtx.outputNodeId = state.idRegistry.getOrCreate(
                        `${agentInternalKey}:output`,
                    );
                    const outputNode = {
                        id: agentCtx.outputNodeId,
                        kind: "output" as const,
                        status: "success" as const,
                        title: "输出",
                        detail: finalText,
                        streaming: false,
                        finishedAt: now,
                    };
                    if (persist) {
                        prjdb.upsertTrace(state.messageId, agentTraceNodeId, outputNode);
                    }
                    ctx.report({
                        type: "trace.start",
                        messageId: state.messageId,
                        parentId: agentTraceNodeId,
                        node: outputNode,
                    });
                    ctx.report({
                        type: "trace.end",
                        messageId: state.messageId,
                        nodeId: agentCtx.outputNodeId,
                        patch: {
                            status: "success",
                            finishedAt: now,
                        },
                    });
                }
            }
        } else {
            const r = await generateAgent(agent, messages, ctx, settings);
            finalText = r.text;
            usage = r.usage;

            if (!isRoot && finalText) {
                const now = Date.now();
                agentCtx.outputNodeId = state.idRegistry.getOrCreate(
                    `${agentInternalKey}:output`,
                );
                const outputNode = {
                    id: agentCtx.outputNodeId,
                    kind: "output" as const,
                    status: "success" as const,
                    title: "输出",
                    detail: finalText,
                    streaming: false,
                    finishedAt: now,
                };
                if (persist) {
                    prjdb.upsertTrace(state.messageId, agentTraceNodeId, outputNode);
                }
                ctx.report({
                    type: "trace.start",
                    messageId: state.messageId,
                    parentId: agentTraceNodeId,
                    node: outputNode,
                });
                ctx.report({
                    type: "trace.end",
                    messageId: state.messageId,
                    nodeId: agentCtx.outputNodeId,
                    patch: {
                        status: "success",
                        finishedAt: now,
                    },
                });
            }
        }
    } catch (e) {
        failure = e;
    }

    // 7. 清理与完成
    if (ctx.isAborted) {
        handleAbort(ctx, prjdb, state, agentCtx, stepPath, compiled.name, isRoot);
        return { text: "", usage: undefined };
    }

    deltaBuffer.flush(
        persist ? prjdb : undefined,
        persist ? state.messageId : undefined,
    );

    if (failure) {
        handleFailure(ctx, prjdb, state, agentCtx, failure);
    } else {
        finishAgentTrace(ctx, prjdb, state, agentTraceNodeId);
    }

    if (isRoot) {
        // Root agent: 结束消息并通过 prjdb.finishMessage 持久化内容 / isError / agent.
        // 子 agent: 不写 messages 表,inputs/output 已通过 trace 节点保留.
        finishRootMessage(ctx, prjdb, state, finalText, usage, agentIdentity, failure);
    }

    if (failure !== undefined) {
        throw failure;
    }

    ctx.debug(`[PAC][step=${stepPath}] 完成 ${compiled.name}`, {
        output: finalText,
        usage,
    });

    return { text: finalText, usage };
}