import { getSmartModel } from "$libs/model/index.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { globalToolDB } from "$libs/tooldb/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { MessageStreamEvent, TraceStreamEvent } from "$types/shared/chat.js";
import { isStepCount, tool, ToolLoopAgent, type ModelMessage, type Tool } from "ai";
import Logger from "electron-log/main.js";
import {
    appendHistoryMessage, loadHistoryMessages, SYSTEM_FAILURE_MARKER,
} from "./context/index.js";
import { connectLocalMcp, type LocalMcpClient } from "./mcp.js";
import { resolveModelOptions } from "./settings.js";
import { buildUserPrompt, renderSystemPrompt } from "./template.js";
import { agentTraceId, nextSeq, reasoningTraceId, toolTraceId } from "./traceid.js";
import type {
    CompiledPacAgent, IPacAgent, JsonValue, LocalMcpConfig, PacTimeoutConfig,
} from "./type.js";

/**
 * PAC 运行状态：跨 root/sub agent 传递，维护全局唯一性。
 */
export interface PacRunState {
    messageId: string;
    counters: Map<string, number>;
    modelInfo?: { providerId: string; modelId: string };
}

/**
 * 工具调用的 trace 信息
 */
interface ToolCallTraceInfo {
    traceId: string;
    isAgent: boolean;
}

/**
 * PAC 层的 ToolLoopAgent 别名。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolLoopAgent = ToolLoopAgent<any, any, any, any>;

/**
 * 流式消息缓冲：定期落库，避免频繁 DB 写入
 */
class MessageDeltaBuffer {
    private buffer = "";
    private lastFlushTime = Date.now();
    private readonly flushIntervalMs = 500;
    private readonly flushThreshold = 200;

    push(delta: string): void {
        this.buffer += delta;
        if (
            this.buffer.length >= this.flushThreshold ||
            Date.now() - this.lastFlushTime > this.flushIntervalMs
        ) {
            this.flush();
        }
    }

    flush(prjdb?: PrjDB, messageId?: string): void {
        if (this.buffer.length === 0) return;
        if (prjdb && messageId) {
            try {
                prjdb.appendMessageDelta(messageId, this.buffer);
            } catch (e) {
                Logger.warn("[PAC] appendMessageDelta 失败:", e);
            }
        }
        this.buffer = "";
        this.lastFlushTime = Date.now();
    }

    getBuffer(): string {
        return this.buffer;
    }
}

/**
 * PAC Agent 运行时。相对 compiled 的"纯数据"而言,本类负责:
 *
 *  - 从 PrjDB 解析本次运行的模型(含子 tools 透传);
 *  - 根 agent 流式输出(settings.streaming,默认 true);
 *  - 思考 providerOptions(settings.thinking,默认 true,实际效果依赖模型);
 *  - 以 compiled.id 定位 HistoryStore,每个 PAC 文件维护自己的历史;
 *  - 历史"事务化"写入:无论成功失败都写一对 (user, assistant),失败用
 *    SYSTEM_FAILURE_MARKER 占位,保证历史永远配对;
 *  - 把 ctx.signal 透传给 generate/stream,实现 provider 级即时中断;
 *  - 按 settings.timeout 透传超时;
 *  - 为每个 step / 子 tool 分配 stepPath,通过 ctx.debug 上报进入/完成及输入/输出;
 *  - 聚合 usage 并通过 ctx.report 上报。
 *  - 全链路汇报 trace 节点：root agent 节点 + tools + sub-agent + reasoning;
 *  - 流式汇报 message 增量与 thinking;
 *  - 持久化消息与 trace 树到 PrjDB。
 *
 * 子 agent 工具返回原文,异常继续冒泡给 AI SDK 转 tool-error,保持原有约定。
 */
export class PacAgent implements IPacAgent {
    constructor(private readonly compiled: CompiledPacAgent) { }

    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }

    /** 顶层入口:isRoot=true,stepPath="1"。*/
    async run(ctx: IRunnerContext): Promise<string> {
        const mcpClients = new Map<LocalMcpConfig, LocalMcpClient>();
        try {
            // 创建 root message
            const prjdb = PrjDB.ensure(ctx.prj);
            const messageId = prjdb.saveMessage({
                sessionId: ctx.sessId,
                role: "assistant",
                content: "",
            });

            // 创建运行状态
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
                state
            );
        } finally {
            await this.closeLocalMcpClients(mcpClients);
        }
    }

    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue> = {},
        options: { validateInputs?: boolean; isRoot?: boolean; stepPath?: string; parentTraceId?: string } = {},
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        state?: PacRunState,
    ): Promise<string> {
        if (ctx.isAborted) return "";
        const validateInputs = options.validateInputs ?? true;
        const isRoot = options.isRoot ?? false;
        const stepPath = options.stepPath ?? "1";
        const parentTraceId = options.parentTraceId ?? undefined;
        const prjdb = PrjDB.ensure(ctx.prj);

        // 确保 state 存在；若非 root 且无 state，为独立运行创建一个
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
        const willStream = isRoot && settings.streaming;
        const histEnabled = settings.history !== 0;

        // 创建本 agent 的 trace 节点
        const agentSeq = nextSeq(state.counters, `agent:${this.compiled.id}`);
        const agentTraceNodeId = agentTraceId(this.compiled.id, agentSeq);
        const traceNode = {
            id: agentTraceNodeId,
            kind: "agent" as const,
            status: "running" as const,
            title: this.compiled.name,
            agent: { name: this.compiled.name },
            children: [],
        };
        prjdb.upsertTrace(state.messageId, parentTraceId ?? null, traceNode);

        // emit trace.start 事件
        if (isRoot) {
            const evt: TraceStreamEvent = {
                type: "trace.start",
                messageId: state.messageId,
                parentId: undefined,
                node: traceNode,
            };
            ctx.report(evt);
        }

        const tools = await this.materializeTools(ctx, effectiveDefaults, mcpClients, stepPath, state, agentTraceNodeId);
        const system = await renderSystemPrompt(
            this.compiled, ctx, inputs, effectiveDefaults, isRoot,
        );
        const userText = await buildUserPrompt(
            this.compiled, ctx, inputs, effectiveDefaults, isRoot,
        );

        const userMessage: ModelMessage = { role: "user", content: userText };
        const prior = histEnabled
            ? await loadHistoryMessages(ctx, this.compiled.id, settings.history)
            : [];
        const messages: ModelMessage[] = [...prior, userMessage];

        ctx.debug(
            `[PAC][step=${stepPath}] 进入 ${this.compiled.name} ` +
            `(tools=${Object.keys(tools).length}, streaming=${willStream}, ` +
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

        // 获取模型信息并汇报
        const modelOptions = resolveModelOptions(ctx);
        const model = getSmartModel(modelOptions as never, ctx);
        const providerId = model?.provider ?? "unknown";
        const modelId = model?.modelId ?? "unknown";
        state.modelInfo = { providerId, modelId };

        // 更新 agent trace 节点描述，并汇报模型信息
        if (isRoot) {
            prjdb.patchTrace(agentTraceNodeId, {
                description: `模型: ${providerId}/${modelId}`,
            });
            const metaEvt: MessageStreamEvent = {
                type: "message.meta",
                messageId: state.messageId,
                meta: { model: { providerId, modelId } },
            };
            ctx.report(metaEvt);
        }

        const providerOptions = settings.thinking ? THINKING_PROVIDER_OPTIONS : undefined;

        // 工具调用 trace 映射
        const toolCallTraces = new Map<string, ToolCallTraceInfo>();

        const agent: AnyToolLoopAgent = new ToolLoopAgent({
            model,
            instructions: system,
            stopWhen: isStepCount(settings.maxSteps),
            tools,
            providerOptions,
            onToolExecutionStart: (e: ToolExecStartEvent) => {
                const key = e.toolCall.toolName;
                const ref = this.compiled.toolRefs.find(r => r.key === key);

                // Agent 工具的 trace 由子 agent 自己创建；这里仅记录映射
                if (ref?.agent) {
                    toolCallTraces.set(e.toolCall.toolCallId, {
                        traceId: agentTraceId(ref.agent.id, nextSeq(state.counters, `agent:${ref.agent.id}`)),
                        isAgent: true,
                    });
                    return;
                }

                // 非 agent 工具：创建工具 trace 节点
                const toolSeq = nextSeq(state.counters, `tool:${key}`);
                const fallbackRef = { key, origin: "builtin" as const, meta: null, agent: null, local: null, mcpLocal: undefined, declaredAs: undefined };
                const toolTraceNodeId = toolTraceId(ref || fallbackRef, toolSeq);
                toolCallTraces.set(e.toolCall.toolCallId, { traceId: toolTraceNodeId, isAgent: false });

                const toolNode = {
                    id: toolTraceNodeId,
                    kind: "tool" as const,
                    status: "running" as const,
                    title: key,
                    toolName: key,
                };
                prjdb.upsertTrace(state.messageId, agentTraceNodeId, toolNode);

                ctx.debug(
                    `[PAC][step=${stepPath}] 工具执行开始 ${key}`,
                    { toolCallId: e.toolCall.toolCallId, input: e.toolCall.input },
                );
            },
            onToolExecutionEnd: (e: ToolExecEndEvent) => {
                const traceInfo = toolCallTraces.get(e.toolCall.toolCallId);
                if (!traceInfo || traceInfo.isAgent) return;

                // 先判断是否为错误类型
                if (e.toolOutput.type === 'tool-error') {
                    // 在这个分支内，e.toolOutput 的类型已被收窄
                    // 可以安全地访问 e.toolOutput.error
                    const errorDescription = `错误: ${String(e.toolOutput.error ?? '未知错误')}`;

                    prjdb.patchTrace(traceInfo.traceId, {
                        status: 'error',
                        finishedAt: Date.now(),
                        description: errorDescription,
                    });

                    ctx.debug(
                        `[PAC][step=${stepPath}] 工具执行失败 ${e.toolCall.toolName}`,
                        { toolCallId: e.toolCall.toolCallId, error: String(e.toolOutput.error) },
                    );
                    return; // 处理完错误后可以提前返回
                }

                // 这里 TypeScript 知道 e.toolOutput 一定是 'tool-result' 类型
                // 可以安全地访问 e.toolOutput.output
                prjdb.patchTrace(traceInfo.traceId, {
                    status: 'success',
                    finishedAt: Date.now(),
                    description: `耗时: ${e.toolExecutionMs}ms`,
                });

                ctx.debug(
                    `[PAC][step=${stepPath}] 工具执行完成 ${e.toolCall.toolName}`,
                    { toolCallId: e.toolCall.toolCallId, durationMs: e.toolExecutionMs, output: e.toolOutput.output },
                );
            },
            onError: (ev: { error: unknown }) => {
                Logger.warn(`[PAC][step=${stepPath}] ${this.compiled.name} agent 内部错误:`, ev.error);
            },
        } as never);

        let finalText = "";
        let usage: unknown = undefined;
        let failure: unknown = undefined;
        const deltaBuffer = new MessageDeltaBuffer();
        let reasoningTraceNodeId: string | undefined = undefined;

        try {
            if (willStream) {
                const r = await streamRoot(
                    agent,
                    messages,
                    ctx,
                    settings.timeout,
                    state,
                    agentTraceNodeId,
                    deltaBuffer,
                    prjdb,
                    (tid) => {
                        reasoningTraceNodeId = tid;
                    }
                );
                finalText = r.text;
                usage = r.usage;
            } else {
                const result = await agent.generate(buildCallArgs(messages, ctx, settings.timeout));
                finalText = (result as { text?: string }).text ?? "";
                usage = (result as { totalUsage?: unknown; usage?: unknown }).totalUsage
                    ?? (result as { usage?: unknown }).usage;
            }
        } catch (e) {
            failure = e;
        }

        // 中断场景
        if (ctx.isAborted) {
            ctx.debug(`[PAC][step=${stepPath}] ${this.compiled.name} 已中断`);
            return "";
        }

        // 落库：刷新最后的 delta
        deltaBuffer.flush(prjdb, state.messageId);

        // 更新 agent 节点状态
        const agentNodePatch = {
            status: failure ? ("error" as const) : ("success" as const),
            finishedAt: Date.now(),
            description: failure
                ? `错误: ${String(failure instanceof Error ? failure.message : failure)}`
                : undefined,
        };
        prjdb.patchTrace(agentTraceNodeId, agentNodePatch);

        // 更新 reasoning 节点（若有）
        if (reasoningTraceNodeId && !failure) {
            prjdb.patchTrace(reasoningTraceNodeId, { status: "success", finishedAt: Date.now() });
        }

        // 完成 message
        if (isRoot) {
            prjdb.finishMessage(state.messageId, {
                content: finalText,
                isError: !!failure,
                agent: { name: this.compiled.name, model: modelId },
            });
        }

        // 事务化历史写入
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

        ctx.debug(
            `[PAC][step=${stepPath}] 完成 ${this.compiled.name}`,
            { output: finalText, usage },
        );
        if (usage) {
            ctx.report({
                type: "message.end",
                messageId: state.messageId,
                content: finalText,
                meta: {
                    stepPath,
                    agent: this.compiled.name,
                    agentId: this.compiled.id,
                    usage
                },
            });
        }

        return finalText;
    }

    /**
     * 物化 ToolSet。子 agent 包装为 Tool 并透传 stepPath;其它工具直接取
     * 已有实例。
     */
    private async materializeTools(
        ctx: IRunnerContext,
        parentDefaults: Record<string, JsonValue>,
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        parentStepPath: string,
        state: PacRunState,
        parentTraceId: string,
    ): Promise<Record<string, Tool>> {
        const out: Record<string, Tool> = {};
        for (let i = 0; i < this.compiled.toolRefs.length; i++) {
            const ref = this.compiled.toolRefs[i];
            const childStepPath = `${parentStepPath}.${i + 1}`;

            if (ref.agent) {
                out[ref.key] = buildAgentTool(
                    ref.agent, ctx, parentDefaults, mcpClients, childStepPath, state, parentTraceId,
                );
            } else if (ref.local) {
                out[ref.key] = ref.local.tool;
            } else if (ref.mcpLocal) {
                const { config, tool: info } = ref.mcpLocal;
                let client = mcpClients.get(config);
                if (!client) {
                    try {
                        client = await connectLocalMcp(config);
                        mcpClients.set(config, client);
                    } catch (e) {
                        Logger.error(
                            `[PAC] ${this.compiled.name}: 局部 MCP 连接失败,跳过工具 ${ref.key}`,
                            e,
                        );
                        continue;
                    }
                }
                const tools = (await client.tools()) as Record<string, Tool>;
                const t = tools[info.name];
                if (t) {
                    out[ref.key] = t;
                } else {
                    Logger.warn(
                        `[PAC] ${this.compiled.name}: 局部 MCP 工具 ${info.name} 未找到,跳过`,
                    );
                }
            } else if (ref.meta) {
                const live = globalToolDB.getToolMeta(ref.meta.id);
                if (live) {
                    out[ref.key] = live.tool;
                } else {
                    Logger.warn(
                        `[PAC] ${this.compiled.name}: 工具 ${ref.meta.id} 已不在工具库中` +
                        `(MCP server 断开或被移除?),本次运行跳过`,
                    );
                }
            }
        }
        return out;
    }

    private async closeLocalMcpClients(
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    ): Promise<void> {
        for (const [, client] of mcpClients) {
            try {
                await client.close();
            } catch (e) {
                Logger.warn(`[PAC] 关闭局部 MCP 连接失败:`, e);
            }
        }
        mcpClients.clear();
    }

    private inputsFromCtx(ctx: IRunnerContext): Record<string, unknown> {
        const args = ctx.cmd?.args;
        if (!args || typeof args !== 'object' || Array.isArray(args)) {
            return {};
        }
        return { ...args as Record<string, unknown> };
    }
}

/* ──────────────────────────────────────────────────────────── */

function buildCallArgs(
    messages: ModelMessage[],
    ctx: IRunnerContext,
    timeout: PacTimeoutConfig | undefined,
): never {
    const args: Record<string, unknown> = {
        messages,
        abortSignal: ctx.signal,
        options: undefined,
    };
    if (timeout !== undefined) args.timeout = timeout;
    return args as never;
}

/* ──────────────────────────────────────────────────────────── */

/**
 * 流式执行根 agent，优先使用 fullStream 获取 reasoning 内容。
 * 
 * AI SDK v7 中 reasoning 是独立的 part type，不在 textStream 中。
 * 必须使用 fullStream 才能捕获 reasoning-delta 部分。
 */
async function streamRoot(
    agent: AnyToolLoopAgent,
    messages: ModelMessage[],
    ctx: IRunnerContext,
    timeout: PacTimeoutConfig | undefined,
    state: PacRunState,
    agentTraceNodeId: string,
    deltaBuffer: MessageDeltaBuffer,
    prjdb: PrjDB,
    onReasoningTraceId: (id: string) => void,
): Promise<{ text: string; usage: unknown }> {
    const res = await agent.stream(buildCallArgs(messages, ctx, timeout));
    const textBuf: string[] = [];
    let reasoningNodeId: string | undefined;

    try {
        for await (const part of res.stream) {
            if (ctx.isAborted) break;

            // 文本增量 - 字段名是 text 不是 textDelta
            if (part.type === "text-delta") {
                const delta = part.text;
                textBuf.push(delta);
                deltaBuffer.push(delta);
                const evt: MessageStreamEvent = {
                    type: "message.delta",
                    messageId: state.messageId,
                    delta,
                };
                ctx.report(evt);
            }
            // Reasoning 增量 - 字段名是 text 不是 textDelta
            else if (part.type === "reasoning-delta") {
                const thinkDelta = part.text;
                if (thinkDelta) {
                    if (!reasoningNodeId) {
                        reasoningNodeId = reasoningTraceId(agentTraceNodeId);
                        const node = {
                            id: reasoningNodeId,
                            kind: "reasoning" as const,
                            status: "running" as const,
                            title: "思考",
                        };
                        prjdb.upsertTrace(state.messageId, agentTraceNodeId, node);
                        onReasoningTraceId(reasoningNodeId);
                    }
                    const evt: MessageStreamEvent = {
                        type: "message.thinking.delta",
                        messageId: state.messageId,
                        delta: thinkDelta,
                    };
                    ctx.report(evt);
                    prjdb.appendTraceDetail(reasoningNodeId, thinkDelta);
                }
            }
        }
    } catch (e) {
        Logger.warn("[PAC] stream 处理失败:", e);
        throw e;
    }

    const text = (await res.text) ?? textBuf.join("");
    const usage = await res.usage;
    return { text, usage };
}

/* ──────────────────────────────────────────────────────────── */

const THINKING_PROVIDER_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({
    anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
    openai: { reasoningEffort: "medium" },
    google: { thinkingConfig: { includeThoughts: true } },
});

/* ──────────────────────────────────────────────────────────── */

interface ToolExecStartEvent {
    toolCall: { toolName: string; toolCallId: string; input: unknown };
}

interface ToolExecEndEvent {
    toolCall: { toolName: string; toolCallId: string };
    toolExecutionMs: number;
    toolOutput:
    | { type: "tool-result"; output: unknown }
    | { type: "tool-error"; error: unknown };
}

/* ──────────────────────────────────────────────────────────── */

/**
 * 子 agent → Tool 包装
 */
export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    inheritedDefaults: Record<string, JsonValue> = {},
    mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    stepPath: string = compiled.name,
    state: PacRunState,
    parentTraceId: string,
): Tool {
    const execute = async (input: unknown): Promise<string> => {
        const sub = new PacAgent(compiled);
        return sub.runWithInputs(
            ctx,
            (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>,
            inheritedDefaults,
            { stepPath, parentTraceId },
            mcpClients,
            state,
        );
    };
    return tool({
        description: compiled.description,
        inputSchema: compiled.inputSchema,
        execute,
    });
}