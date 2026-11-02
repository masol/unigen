import { getSmartModel } from "$libs/model/index.js";
import { globalToolDB } from "$libs/tooldb/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import {
    isStepCount,
    tool,
    ToolLoopAgent,
    type ModelMessage,
    type Tool,
} from "ai";
import Logger from "electron-log/main.js";
import { isString } from "radashi";
import {
    appendHistoryMessage,
    loadHistoryMessages,
    SYSTEM_FAILURE_MARKER,
} from "./context/index.js";
import { connectLocalMcp, type LocalMcpClient } from "./mcp.js";
import { resolveModelOptions } from "./settings.js";
import { buildUserPrompt, renderSystemPrompt } from "./template.js";
import type {
    CompiledPacAgent,
    IPacAgent,
    JsonValue,
    LocalMcpConfig,
    PacTimeoutConfig,
} from "./type.js";

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
            return await this.runWithInputs(
                ctx,
                this.inputsFromCtx(ctx),
                {},
                { validateInputs: false, isRoot: true, stepPath: "1" },
                mcpClients,
            );
        } finally {
            await this.closeLocalMcpClients(mcpClients);
        }
    }

    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue> = {},
        options: {
            validateInputs?: boolean;
            isRoot?: boolean;
            stepPath?: string;
            parentTraceId?: string;
        } = {},
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    ): Promise<string> {
        if (ctx.isAborted) return "";

        const validateInputs = options.validateInputs ?? true;
        const isRoot = options.isRoot ?? false;
        const stepPath = options.stepPath ?? "1";
        const parentTraceId = options.parentTraceId;
        const label =
            `${this.compiled.name}${this.compiled.passthrough ? " (passthrough)" : ""}` +
            ` [id=${this.compiled.id}, src=${this.compiled.sourcePath}]`;

        let inputs: Record<string, unknown> = rawInputs;
        if (validateInputs) {
            const parsed = this.compiled.inputSchema.safeParse(rawInputs);
            if (!parsed.success) {
                Logger.warn(
                    `[PAC][step=${stepPath}] ${label} 输入校验失败(将以原值运行):`,
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

        const traceId = `agent:${this.compiled.id}`;
        const traceTitle = `Agent ${this.compiled.name}`;
        const startedAt = Date.now();

        ctx.notify("chat-stream", {
            type: "trace.start",
            messageId: ctx.messageId,
            parentId: parentTraceId,
            node: {
                id: traceId,
                kind: "agent",
                status: "running",
                title: traceTitle,
                description: label,
                startedAt,
                agent: {
                    name: this.compiled.name,
                },
                children: [],
            },
        } satisfies ChatStreamEvent);

        let finalText = "";
        let usage: unknown;
        let failure: unknown;
        let modelIdentity: string | undefined;

        try {
            const tools = await this.materializeTools(
                ctx,
                effectiveDefaults,
                mcpClients,
                stepPath,
                traceId,
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

            const userMessage: ModelMessage = {
                role: "user",
                content: userText,
            };
            const prior = histEnabled
                ? await loadHistoryMessages(ctx, this.compiled.id, settings.history)
                : [];
            const messages: ModelMessage[] = [...prior, userMessage];

            safeDebug(
                ctx,
                `[PAC][step=${stepPath}] 进入 ${label} ` +
                `(tools=${Object.keys(tools).length}, streaming=${willStream}, ` +
                `thinking=${settings.thinking}, history=${prior.length}, ` +
                `maxSteps=${settings.maxSteps}, timeout=${JSON.stringify(settings.timeout)})`,
                { inputs },
            );

            Logger.debug(
                `[PAC][step=${stepPath}] run ${label}\n` +
                `────────── SYSTEM PROMPT ──────────\n${system}\n` +
                `────────── MESSAGES (${messages.length} total, last is current user) ──────────\n` +
                `${JSON.stringify(messages, null, 2)}\n` +
                `────────────────────────────────────`,
            );

            const modelOptions = resolveModelOptions(ctx);
            const model = getSmartModel(modelOptions as never, ctx);
            modelIdentity = readModelIdentity(model);

            ctx.notify("chat-stream", {
                type: "trace.update",
                messageId: ctx.messageId,
                nodeId: traceId,
                patch: {
                    description: modelIdentity
                        ? `${label}; model=${modelIdentity}`
                        : label,
                },
            } satisfies ChatStreamEvent);

            const providerOptions = settings.thinking
                ? THINKING_PROVIDER_OPTIONS
                : undefined;

            const agent: AnyToolLoopAgent = new ToolLoopAgent({
                model,
                instructions: system,
                stopWhen: isStepCount(settings.maxSteps),
                tools,
                providerOptions,
                onToolExecutionStart: (e: ToolExecStartEvent) => {
                    safeDebug(
                        ctx,
                        `[PAC][step=${stepPath}] 工具执行开始 ${e.toolCall.toolName}`,
                        {
                            toolCallId: e.toolCall.toolCallId,
                            input: e.toolCall.input,
                        },
                    );
                },
                onToolExecutionEnd: (e: ToolExecEndEvent) => {
                    const out =
                        e.toolOutput.type === "tool-result"
                            ? { output: e.toolOutput.output }
                            : { error: String(e.toolOutput.error) };

                    safeDebug(
                        ctx,
                        `[PAC][step=${stepPath}] 工具执行完成 ${e.toolCall.toolName}`,
                        {
                            toolCallId: e.toolCall.toolCallId,
                            durationMs: e.toolExecutionMs,
                            ...out,
                        },
                    );
                },
                onError: (ev: { error: unknown }) => {
                    Logger.warn(
                        `[PAC][step=${stepPath}] ${label} agent 内部错误:`,
                        ev.error,
                    );
                },
            } as never);

            if (willStream) {
                const result = await streamRoot(
                    agent,
                    messages,
                    ctx,
                    settings.timeout,
                    traceId,
                );
                finalText = result.text;
                usage = result.usage;
            } else {
                const result = await agent.generate(
                    buildCallArgs(messages, ctx, settings.timeout),
                );
                finalText = (result as { text?: string }).text ?? "";
                usage =
                    (result as { totalUsage?: unknown; usage?: unknown }).totalUsage ??
                    (result as { usage?: unknown }).usage;
            }
        } catch (e) {
            failure = e;
        }

        if (ctx.isAborted) {
            ctx.notify("chat-stream", {
                type: "trace.update",
                messageId: ctx.messageId,
                nodeId: traceId,
                patch: {
                    status: "error",
                    finishedAt: Date.now(),
                },
            } satisfies ChatStreamEvent);

            safeDebug(
                ctx,
                `[PAC][step=${stepPath}] ${label} 已中断,跳过历史写入`,
            );
            return "";
        }

        if (histEnabled) {
            if (failure !== undefined) {
                Logger.warn(
                    `[PAC][step=${stepPath}] ${label} 生成失败,写入 SYSTEM_FAILURE_MARKER 占位:`,
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

        ctx.notify("chat-stream", {
            type: "trace.update",
            messageId: ctx.messageId,
            nodeId: traceId,
            patch: {
                status: failure === undefined ? "success" : "error",
                finishedAt: Date.now(),
                detail: failure === undefined
                    ? undefined
                    : errorMessage(failure),
            },
        } satisfies ChatStreamEvent);

        if (failure !== undefined) {
            throw failure;
        }

        safeDebug(
            ctx,
            `[PAC][step=${stepPath}] 完成 ${label}`,
            { output: finalText, usage },
        );

        if (usage) {
            safeNotify(ctx, "usage", {
                stepPath,
                agent: this.compiled.name,
                agentId: this.compiled.id,
                usage,
            });
        }

        return finalText;
    }

    private async materializeTools(
        ctx: IRunnerContext,
        parentDefaults: Record<string, JsonValue>,
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        parentStepPath: string,
        parentTraceId: string,
    ): Promise<Record<string, Tool>> {
        const out: Record<string, Tool> = {};

        for (let i = 0; i < this.compiled.toolRefs.length; i++) {
            const ref = this.compiled.toolRefs[i];
            const childStepPath = `${parentStepPath}.${i + 1}`;

            if (ref.agent) {
                out[ref.key] = buildAgentTool(
                    ref.agent,
                    ctx,
                    parentDefaults,
                    mcpClients,
                    childStepPath,
                    parentTraceId,
                );
            } else if (ref.local) {
                out[ref.key] = buildTraceTool(
                    ref.key,
                    ref.local.tool,
                    ctx,
                    childStepPath,
                    parentTraceId,
                    "skill",
                );
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
                    out[ref.key] = buildTraceTool(
                        ref.key,
                        t,
                        ctx,
                        childStepPath,
                        parentTraceId,
                        "mcp_local",
                    );
                } else {
                    Logger.warn(
                        `[PAC] ${this.compiled.name}: 局部 MCP 工具 ${info.name} 未找到,跳过`,
                    );
                }
            } else if (ref.meta) {
                const live = globalToolDB.getToolMeta(ref.meta.id);
                if (live) {
                    out[ref.key] = buildTraceTool(
                        ref.key,
                        live.tool,
                        ctx,
                        childStepPath,
                        parentTraceId,
                        ref.origin,
                    );
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
                Logger.warn("[PAC] 关闭局部 MCP 连接失败:", e);
            }
        }
        mcpClients.clear();
    }

    private inputsFromCtx(ctx: IRunnerContext): Record<string, unknown> {
        const args = (ctx.cmd?.args as Record<string, unknown> | undefined) ?? {};
        return { ...args };
    }
}

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

async function streamRoot(
    agent: AnyToolLoopAgent,
    messages: ModelMessage[],
    ctx: IRunnerContext,
    timeout: PacTimeoutConfig | undefined,
    agentTraceId: string,
): Promise<{ text: string; usage: unknown }> {
    const res = await agent.stream(buildCallArgs(messages, ctx, timeout));
    const buf: string[] = [];

    for await (const chunk of res.textStream) {
        if (ctx.isAborted) break;

        if (typeof chunk === "string" && chunk.length > 0) {
            buf.push(chunk);
            safeDebug(ctx, "[PAC][stream]", chunk);
            safeNotify(ctx, "stream", chunk);

            ctx.notify("chat-stream", {
                type: "message.delta",
                messageId: ctx.messageId,
                delta: chunk,
            } satisfies ChatStreamEvent);
        }
    }

    const text = (await res.text) ?? buf.join("");
    const usage = await res.totalUsage;

    ctx.notify("chat-stream", {
        type: "message.end",
        messageId: ctx.messageId,
        content: text,
    } satisfies ChatStreamEvent);

    ctx.notify("chat-stream", {
        type: "trace.update",
        messageId: ctx.messageId,
        nodeId: agentTraceId,
        patch: {
            status: "success",
            finishedAt: Date.now(),
        },
    } satisfies ChatStreamEvent);

    return { text, usage };
}

const THINKING_PROVIDER_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({
    anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
    openai: { reasoningEffort: "medium" },
    google: { thinkingConfig: { includeThoughts: true } },
});

interface ToolExecStartEvent {
    toolCall: {
        toolName: string;
        toolCallId: string;
        input: unknown;
    };
}

interface ToolExecEndEvent {
    toolCall: {
        toolName: string;
        toolCallId: string;
    };
    toolExecutionMs: number;
    toolOutput:
    | { type: "tool-result"; output: unknown }
    | { type: "tool-error"; error: unknown };
}

function safeDebug(ctx: IRunnerContext, msg: string, data?: unknown): void {
    try {
        if (data === undefined) ctx.debug(msg);
        else ctx.debug(msg, data);
    } catch (e) {
        Logger.warn(`[PAC] ctx.debug 调用失败: ${msg}`, e);
    }
}

function safeNotify(ctx: IRunnerContext, channel: string, data: unknown): void {
    try {
        ctx.notify(channel, isString(data) ? data : JSON.stringify(data));
    } catch (e) {
        Logger.warn(`[PAC] ctx.notify("${channel}") 调用失败`, e);
    }
}

export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    inheritedDefaults: Record<string, JsonValue> = {},
    mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    stepPath: string = compiled.name,
    parentTraceId?: string,
): Tool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = async (input: any): Promise<string> => {
        const sub = new PacAgent(compiled);
        return sub.runWithInputs(
            ctx,
            (input ?? {}) as Record<string, unknown>,
            inheritedDefaults,
            { stepPath, parentTraceId },
            mcpClients,
        );
    };

    return tool({
        description: compiled.description,
        inputSchema: compiled.inputSchema,
        execute,
    });
}

function buildTraceTool(
    key: string,
    original: Tool,
    ctx: IRunnerContext,
    stepPath: string,
    parentTraceId: string,
    origin: string,
): Tool {
    const traceId = `tool:${origin}:${key}`;

    return tool({
        description: original.description,
        inputSchema: original.inputSchema,
        execute: async (input: unknown, options: { toolCallId?: string } = {}) => {
            const toolCallId = options.toolCallId ?? `${stepPath}:${traceId}`;
            const startedAt = Date.now();

            ctx.notify("chat-stream", {
                type: "trace.start",
                messageId: ctx.messageId,
                parentId: parentTraceId,
                node: {
                    id: traceId,
                    kind: "tool",
                    status: "running",
                    title: `Tool ${key}`,
                    description: `${origin}:${key}`,
                    startedAt,
                    toolName: key,
                },
            } satisfies ChatStreamEvent);

            try {
                const output = await original.execute?.(input, options);
                const detail = serializeToolOutput(output);

                ctx.notify("chat-stream", {
                    type: "trace.end",
                    messageId: ctx.messageId,
                    nodeId: traceId,
                    detail,
                } satisfies ChatStreamEvent);

                return output;
            } catch (error) {
                const message = errorMessage(error);

                ctx.notify("chat-stream", {
                    type: "trace.update",
                    messageId: ctx.messageId,
                    nodeId: traceId,
                    patch: {
                        status: "error",
                        description: message,
                        finishedAt: Date.now(),
                    },
                } satisfies ChatStreamEvent);

                throw error;
            }
        },
    });
}

function serializeToolOutput(output: unknown): string {
    if (typeof output === "string") return output;
    try {
        return JSON.stringify(output, null, 2) ?? "";
    } catch {
        return String(output);
    }
}

function readModelIdentity(model: unknown): string | undefined {
    if (!model || typeof model !== "object") return undefined;

    const candidate = model as {
        modelId?: string;
        provider?: string;
        model?: { modelId?: string; provider?: string };
    };

    const modelId = candidate.modelId ?? candidate.model?.modelId;
    const provider = candidate.provider ?? candidate.model?.provider;

    if (provider && modelId) return `${provider}/${modelId}`;
    return modelId;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}