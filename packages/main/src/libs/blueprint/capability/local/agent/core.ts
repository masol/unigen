// packages/main/src/libs/blueprint/capability/local/agent/core.ts

import { getSmartModel } from "$libs/model/index.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { MessageStreamEvent, TraceStreamEvent } from "$types/shared/chat.js";
import { isStepCount, ToolLoopAgent, type ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import {
    appendHistoryMessage,
    loadHistoryMessages,
    SYSTEM_FAILURE_MARKER,
} from "../context/index.js";
import type { LocalMcpClient } from "../mcp.js";
import { resolveModelOptions } from "../settings.js";
import { buildUserPrompt, renderSystemPrompt } from "../template.js";
import { agentTraceId, nextSeq } from "../traceid.js";
import type {
    CompiledPacAgent,
    IPacAgent,
    JsonValue,
    LocalMcpConfig,
} from "../type.js";
import { MessageDeltaBuffer } from "./buffer.js";
import { createToolCallbacks } from "./callbacks.js";
import { generateAgent, streamAgent } from "./executor.js";
import { closeLocalMcpClients, materializeTools } from "./tools.js";
import type { PacRunState, RunOptions, ToolCallTraceInfo } from "./types.js";
import { THINKING_PROVIDER_OPTIONS } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolLoopAgent = ToolLoopAgent<any, any, any, any>;

export class PacAgent implements IPacAgent {
    constructor(private readonly compiled: CompiledPacAgent) { }

    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }

    async run(ctx: IRunnerContext): Promise<string> {
        const mcpClients = new Map<LocalMcpConfig, LocalMcpClient>();
        try {
            const prjdb = PrjDB.ensure(ctx.prj);
            const messageId = prjdb.saveMessage({
                sessionId: ctx.sessId,
                role: "assistant",
                content: "",
            });

            const state: PacRunState = {
                messageId,
                counters: new Map(),
            };

            return await this.runWithInputs(
                ctx,
                this.inputsFromCtx(ctx),
                {},
                { validateInputs: false, isRoot: true, stepPath: "1" },
                mcpClients,
                state,
            );
        } finally {
            await closeLocalMcpClients(mcpClients);
        }
    }

    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue> = {},
        options: RunOptions = {},
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        state?: PacRunState,
    ): Promise<string> {
        if (ctx.isAborted) return "";
        const validateInputs = options.validateInputs ?? true;
        const isRoot = options.isRoot ?? false;
        const stepPath = options.stepPath ?? "1";
        const parentTraceId = options.parentTraceId ?? undefined;
        const prjdb = PrjDB.ensure(ctx.prj);

        if (!state) {
            const messageId = prjdb.saveMessage({
                sessionId: ctx.sessId,
                role: "assistant",
                content: "",
            });
            state = { messageId, counters: new Map() };
        }

        let inputs: Record<string, unknown> = rawInputs;
        if (validateInputs) {
            const parsed = this.compiled.inputSchema.safeParse(rawInputs);
            if (!parsed.success) {
                Logger.warn(
                    `[PAC][step=${stepPath}] ${this.compiled.name} 输入校验失败(将以原值运行):`,
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
            ...this.compiled.ownDefaults,
        };
        const settings = this.compiled.settings;
        const shouldStream = isRoot ? settings.streaming : true;
        const histEnabled = settings.history !== 0;

        const modelOptions = resolveModelOptions(ctx);
        const model = getSmartModel(modelOptions as never, ctx);
        const providerId = model?.provider ?? "unknown";
        const modelId = model?.modelId ?? "unknown";
        state.modelInfo = { providerId, modelId };

        const agentSeq = nextSeq(state.counters, `agent:${this.compiled.id}`);
        const agentTraceNodeId = agentTraceId(this.compiled.id, agentSeq);
        const agentIdentity = {
            id: agentTraceNodeId,
            name: this.compiled.name,
            model: `${providerId}::${modelId}`,
        };

        if (isRoot) {
            const msgStartEvt: MessageStreamEvent = {
                type: "message.start",
                messageId: state.messageId,
                sessionId: ctx.sessId,
                timestamp: Date.now(),
                agent: agentIdentity,
            };
            ctx.report(msgStartEvt);
        }

        const agentNode = {
            id: agentTraceNodeId,
            kind: "agent" as const,
            status: "running" as const,
            title: this.compiled.name,
            description: `模型: ${providerId}/${modelId}`,
            agent: agentIdentity,
            children: [],
            streaming: true,
        };

        prjdb.upsertTrace(state.messageId, parentTraceId ?? null, agentNode);

        const traceStartEvt: TraceStreamEvent = {
            type: "trace.start",
            messageId: state.messageId,
            parentId: parentTraceId,
            node: agentNode,
        };
        ctx.report(traceStartEvt);

        let inputNodeId: string | undefined;
        if (!isRoot) {
            inputNodeId = `${agentTraceNodeId}:input`;
            const inputNode = {
                id: inputNodeId,
                kind: "input" as const,
                status: "success" as const,
                title: "输入",
                detail: JSON.stringify(inputs, null, 2),
                streaming: false,
            };
            prjdb.upsertTrace(state.messageId, agentTraceNodeId, inputNode);
            ctx.report({
                type: "trace.start",
                messageId: state.messageId,
                parentId: agentTraceNodeId,
                node: inputNode,
            } as TraceStreamEvent);
            ctx.report({
                type: "trace.end",
                messageId: state.messageId,
                nodeId: inputNodeId,
            } as TraceStreamEvent);
        }

        const tools = await materializeTools(
            this.compiled,
            ctx,
            effectiveDefaults,
            mcpClients,
            stepPath,
            state,
            agentTraceNodeId,
            this,
        );
        const system = await renderSystemPrompt(
            this.compiled,
            ctx,
            inputs,
            effectiveDefaults,
            isRoot,
        );
        const userText = await buildUserPrompt(
            this.compiled,
            ctx,
            inputs,
            effectiveDefaults,
            isRoot,
        );

        const userMessage: ModelMessage = { role: "user", content: userText };
        const prior = histEnabled
            ? await loadHistoryMessages(ctx, this.compiled.id, settings.history)
            : [];
        const messages: ModelMessage[] = [...prior, userMessage];

        ctx.debug(
            `[PAC][step=${stepPath}] 进入 ${this.compiled.name} ` +
            `(tools=${Object.keys(tools).length}, shouldStream=${shouldStream}, ` +
            `thinking=${settings.thinking}, history=${prior.length}, ` +
            `maxSteps=${settings.maxSteps}, timeout=${JSON.stringify(settings.timeout)})`,
            { inputs },
        );

        Logger.debug(
            `[PAC][step=${stepPath}] run ${this.compiled.name}\n` +
            `────────── SYSTEM PROMPT ──────────\n${system}\n` +
            `────────── MESSAGES (${messages.length} total, last is current user) ──────────\n` +
            `${JSON.stringify(messages, null, 2)}\n` +
            `────────────────────────────────────`,
        );

        const providerOptions = settings.thinking ? THINKING_PROVIDER_OPTIONS : undefined;

        const toolCallTraces = new Map<string, ToolCallTraceInfo>();

        const callbacks = createToolCallbacks(
            this.compiled,
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
            providerOptions,
            onToolExecutionStart: callbacks.onToolExecutionStart,
            onToolExecutionEnd: callbacks.onToolExecutionEnd,
            onError: (ev: { error: unknown }) => {
                Logger.warn(
                    `[PAC][step=${stepPath}] ${this.compiled.name} agent 内部错误:`,
                    ev.error,
                );
            },
        } as never);

        let finalText = "";
        let usage: unknown = undefined;
        let failure: unknown = undefined;
        const deltaBuffer = new MessageDeltaBuffer();
        let reasoningTraceNodeId: string | undefined = undefined;
        let outputNodeId: string | undefined = undefined;

        try {
            if (shouldStream) {
                let streamSuccess = false;
                try {
                    const r = await streamAgent(
                        agent,
                        messages,
                        ctx,
                        settings.timeout,
                        state,
                        agentTraceNodeId,
                        deltaBuffer,
                        prjdb,
                        isRoot,
                        !isRoot,
                        (reasoningId, outputId) => {
                            reasoningTraceNodeId = reasoningId;
                            outputNodeId = outputId;
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
                    const r = await generateAgent(agent, messages, ctx, settings.timeout);
                    finalText = r.text;
                    usage = r.usage;

                    if (!isRoot && finalText) {
                        outputNodeId = `${agentTraceNodeId}:output`;
                        const outputNode = {
                            id: outputNodeId,
                            kind: "output" as const,
                            status: "success" as const,
                            title: "输出",
                            detail: finalText,
                            streaming: false,
                        };
                        prjdb.upsertTrace(state.messageId, agentTraceNodeId, outputNode);
                        ctx.report({
                            type: "trace.start",
                            messageId: state.messageId,
                            parentId: agentTraceNodeId,
                            node: outputNode,
                        } as TraceStreamEvent);
                        ctx.report({
                            type: "trace.end",
                            messageId: state.messageId,
                            nodeId: outputNodeId,
                        } as TraceStreamEvent);
                    }
                }
            } else {
                const r = await generateAgent(agent, messages, ctx, settings.timeout);
                finalText = r.text;
                usage = r.usage;

                if (!isRoot && finalText) {
                    outputNodeId = `${agentTraceNodeId}:output`;
                    const outputNode = {
                        id: outputNodeId,
                        kind: "output" as const,
                        status: "success" as const,
                        title: "输出",
                        detail: finalText,
                        streaming: false,
                    };
                    prjdb.upsertTrace(state.messageId, agentTraceNodeId, outputNode);
                    ctx.report({
                        type: "trace.start",
                        messageId: state.messageId,
                        parentId: agentTraceNodeId,
                        node: outputNode,
                    } as TraceStreamEvent);
                    ctx.report({
                        type: "trace.end",
                        messageId: state.messageId,
                        nodeId: outputNodeId,
                    } as TraceStreamEvent);
                }
            }
        } catch (e) {
            failure = e;
        }

        // 中断场景：清理未关闭的节点
        if (ctx.isAborted) {
            ctx.debug(`[PAC][step=${stepPath}] ${this.compiled.name} 已中断`);

            if (reasoningTraceNodeId) {
                prjdb.patchTrace(reasoningTraceNodeId, {
                    status: "error",
                    finishedAt: Date.now(),
                });
                ctx.report({
                    type: "trace.end",
                    messageId: state.messageId,
                    nodeId: reasoningTraceNodeId,
                } as TraceStreamEvent);
            }

            if (outputNodeId) {
                prjdb.patchTrace(outputNodeId, {
                    status: "error",
                    finishedAt: Date.now(),
                });
                ctx.report({
                    type: "trace.end",
                    messageId: state.messageId,
                    nodeId: outputNodeId,
                } as TraceStreamEvent);
            }

            prjdb.patchTrace(agentTraceNodeId, {
                status: "error",
                finishedAt: Date.now(),
                description: "已中断",
            });
            ctx.report({
                type: "trace.end",
                messageId: state.messageId,
                nodeId: agentTraceNodeId,
            } as TraceStreamEvent);

            if (isRoot) {
                ctx.report({
                    type: "message.end",
                    messageId: state.messageId,
                    content: "",
                } as MessageStreamEvent);
            }

            return "";
        }

        // 正常完成或失败场景
        deltaBuffer.flush(prjdb, state.messageId);

        // reasoning 和 output 节点已在 streamAgent 内关闭（正常情况）
        // 只有异常情况才需要在这里补关闭
        if (failure && reasoningTraceNodeId) {
            prjdb.patchTrace(reasoningTraceNodeId, {
                status: "error",
                finishedAt: Date.now(),
            });
            ctx.report({
                type: "trace.end",
                messageId: state.messageId,
                nodeId: reasoningTraceNodeId,
            } as TraceStreamEvent);
        }

        if (failure && outputNodeId) {
            prjdb.patchTrace(outputNodeId, {
                status: "error",
                finishedAt: Date.now(),
            });
            ctx.report({
                type: "trace.end",
                messageId: state.messageId,
                nodeId: outputNodeId,
            } as TraceStreamEvent);
        }

        const agentStatus = failure ? ("error" as const) : ("success" as const);
        const agentDesc = failure
            ? `错误: ${String(failure instanceof Error ? failure.message : failure)}`
            : undefined;
        prjdb.patchTrace(agentTraceNodeId, {
            status: agentStatus,
            finishedAt: Date.now(),
            description: agentDesc,
        });

        ctx.report({
            type: "trace.end",
            messageId: state.messageId,
            nodeId: agentTraceNodeId,
        } as TraceStreamEvent);

        if (isRoot) {
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
        }

        if (isRoot) {
            prjdb.finishMessage(state.messageId, {
                content: finalText,
                isError: !!failure,
                agent: agentIdentity,
            });
        }

        if (histEnabled) {
            if (failure !== undefined) {
                Logger.warn(
                    `[PAC][step=${stepPath}] ${this.compiled.name} 生成失败,写入占位符`,
                    failure,
                );
                await appendHistoryMessage(ctx, this.compiled.id, userMessage);
                await appendHistoryMessage(ctx, this.compiled.id, {
                    role: "assistant",
                    content: SYSTEM_FAILURE_MARKER,
                });
            } else if (finalText) {
                await appendHistoryMessage(ctx, this.compiled.id, userMessage);
                await appendHistoryMessage(ctx, this.compiled.id, {
                    role: "assistant",
                    content: finalText,
                });
            }
        }

        if (failure !== undefined) {
            throw failure;
        }

        ctx.debug(`[PAC][step=${stepPath}] 完成 ${this.compiled.name}`, {
            output: finalText,
            usage,
        });

        return finalText;
    }

    /**
     * 子 agent 执行入口（供 buildAgentTool 调用）
     */
    async runSubAgent(
        compiled: CompiledPacAgent,
        ctx: IRunnerContext,
        inputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue>,
        options: RunOptions,
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        state: PacRunState,
    ): Promise<string> {
        const subAgent = new PacAgent(compiled);
        return subAgent.runWithInputs(
            ctx,
            inputs,
            inheritedDefaults,
            options,
            mcpClients,
            state,
        );
    }

    private inputsFromCtx(ctx: IRunnerContext): Record<string, unknown> {
        const args = ctx.cmd?.args;
        if (!args || typeof args !== "object" || Array.isArray(args)) {
            return {};
        }
        return { ...(args as Record<string, unknown>) };
    }
}