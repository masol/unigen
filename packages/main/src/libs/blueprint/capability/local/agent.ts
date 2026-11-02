import { getSmartModel } from "$libs/model/index.js";
import { globalToolDB } from "$libs/tooldb/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { isStepCount, tool, ToolLoopAgent, type ModelMessage, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { isString } from "radashi";
import {
    appendHistoryMessage, loadHistoryMessages, SYSTEM_FAILURE_MARKER,
} from "./context/index.js";
import { connectLocalMcp, type LocalMcpClient } from "./mcp.js";
import { resolveModelOptions } from "./settings.js";
import { buildUserPrompt, renderSystemPrompt } from "./template.js";
import type {
    CompiledPacAgent, IPacAgent, JsonValue, LocalMcpConfig, PacTimeoutConfig,
} from "./type.js";

/**
 * PAC 层的 ToolLoopAgent 别名。
 *
 * ToolLoopAgent 的泛型形参是 <CALL_OPTIONS, TOOLS, CONTEXT, OUTPUT>——PAC 运行期
 * 动态组装 tools、不定义 CallOptions schema、不使用 runtimeContext,也不走结构化
 * output,这几个泛型都无从在编译期精确表达。统一用 `any` 做兜底,比 `never` 更
 * 符合"任何实例我都接受"的语义(`never` 在参数位置是逆变的,只接受 `never`)。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolLoopAgent = ToolLoopAgent<any, any, any, any>;

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
 *  - 聚合 usage 并通过 ctx.notify("usage", ...) 上报。
 *
 * 子 agent 工具返回原文,异常继续冒泡给 AI SDK 转 tool-error,保持原有约定。
 */
export class PacAgent implements IPacAgent {
    constructor(private readonly compiled: CompiledPacAgent) { }

    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }

    /** 顶层入口:isRoot=true,stepPath="1"。 */
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
        options: { validateInputs?: boolean; isRoot?: boolean; stepPath?: string } = {},
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    ): Promise<string> {
        if (ctx.isAborted) return "";
        const validateInputs = options.validateInputs ?? true;
        const isRoot = options.isRoot ?? false;
        const stepPath = options.stepPath ?? "1";
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

        const tools = await this.materializeTools(ctx, effectiveDefaults, mcpClients, stepPath);
        const system = await renderSystemPrompt(
            this.compiled, ctx, inputs, effectiveDefaults, isRoot,
        );
        const userText = await buildUserPrompt(
            this.compiled, ctx, inputs, effectiveDefaults, isRoot,
        );

        // 事务化历史:在内存里组装 [prior..., userMessage] 传给 LLM,
        // 调用成功或失败后再把配对消息写回 store。防御性修复由 loadHistoryMessages 负责。
        const userMessage: ModelMessage = { role: "user", content: userText };
        const prior = histEnabled
            ? await loadHistoryMessages(ctx, this.compiled.id, settings.history)
            : [];
        const messages: ModelMessage[] = [...prior, userMessage];

        safeDebug(ctx,
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
        const providerOptions = settings.thinking ? THINKING_PROVIDER_OPTIONS : undefined;

        const agent: AnyToolLoopAgent = new ToolLoopAgent({
            model,
            instructions: system,
            stopWhen: isStepCount(settings.maxSteps),
            tools,
            providerOptions,
            onToolExecutionStart: (e: ToolExecStartEvent) => {
                safeDebug(ctx,
                    `[PAC][step=${stepPath}] 工具执行开始 ${e.toolCall.toolName}`,
                    { toolCallId: e.toolCall.toolCallId, input: e.toolCall.input },
                );
            },
            onToolExecutionEnd: (e: ToolExecEndEvent) => {
                const out = e.toolOutput.type === "tool-result"
                    ? { output: e.toolOutput.output }
                    : { error: String(e.toolOutput.error) };
                safeDebug(ctx,
                    `[PAC][step=${stepPath}] 工具执行完成 ${e.toolCall.toolName}`,
                    { toolCallId: e.toolCall.toolCallId, durationMs: e.toolExecutionMs, ...out },
                );
            },
            // stream() 内部错误通过 onError 冒泡;不配置则 SDK 直接 console.log,
            // 这里借它落到 Logger。真正的终止控制仍靠 try/catch + ctx.signal。
            onError: (ev: { error: unknown }) => {
                Logger.warn(`[PAC][step=${stepPath}] ${label} agent 内部错误:`, ev.error);
            },
        } as never);

        let finalText = "";
        let usage: unknown = undefined;
        let failure: unknown = undefined;

        try {
            if (willStream) {
                const r = await streamRoot(agent, messages, ctx, settings.timeout);
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

        // 中断场景:静默返回,不写历史(用户主动取消)
        if (ctx.isAborted) {
            safeDebug(ctx, `[PAC][step=${stepPath}] ${label} 已中断,跳过历史写入`);
            return "";
        }

        // 事务化历史写入:成功写真结果,失败写 SYSTEM_FAILURE_MARKER。
        // finalText 为空且无异常(例如模型只调工具不输出,或 maxSteps 耗尽):不写,
        // 避免产生"空助手回复"污染;下轮若读到孤立 user,由 loadHistoryMessages 兜底修复。
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

        if (failure !== undefined) {
            throw failure; // 保留原始错误栈
        }

        safeDebug(ctx,
            `[PAC][step=${stepPath}] 完成 ${label}`,
            { output: finalText, usage },
        );
        if (usage) {
            safeNotify(ctx, "usage", {
                stepPath, agent: this.compiled.name, agentId: this.compiled.id, usage,
            });
        }

        return finalText;
    }

    /**
     * 物化 ToolSet。子 agent 包装为 Tool 并透传 stepPath;其它工具直接取
     * 已有实例。工具级 input/output 由 ToolLoopAgent 的 onToolExecutionStart/End
     * 回调上报,不再手动包装。
     */
    private async materializeTools(
        ctx: IRunnerContext,
        parentDefaults: Record<string, JsonValue>,
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
        parentStepPath: string,
    ): Promise<Record<string, Tool>> {
        const out: Record<string, Tool> = {};
        for (let i = 0; i < this.compiled.toolRefs.length; i++) {
            const ref = this.compiled.toolRefs[i];
            const childStepPath = `${parentStepPath}.${i + 1}`;

            if (ref.agent) {
                out[ref.key] = buildAgentTool(
                    ref.agent, ctx, parentDefaults, mcpClients, childStepPath,
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
        const args = (ctx.cmd?.args as Record<string, unknown> | undefined) ?? {};
        return { ...args };
    }
}

/* ------------------------------------------------------------------ *
 * 调用参数构造
 *
 * `options: undefined` 是为了满足 ToolLoopAgent 的 CALL_OPTIONS 泛型:当未配置
 * callOptionsSchema 时 TS 推不出泛型,把 options 当作必填 `any`;显式传 undefined
 * 可以满足类型检查而不影响运行行为。`as never` 把整个参数对象兜底到 SDK 期望的
 * 严格类型。
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * 流式执行(仅根 agent)
 *
 * ToolLoopAgent.stream 返回 Promise<StreamTextResult>:先 await 拿到结果对象,
 * 再迭代 textStream / await text / await totalUsage。
 * ------------------------------------------------------------------ */

async function streamRoot(
    agent: AnyToolLoopAgent,
    messages: ModelMessage[],
    ctx: IRunnerContext,
    timeout: PacTimeoutConfig | undefined,
): Promise<{ text: string; usage: unknown }> {
    const res = await agent.stream(buildCallArgs(messages, ctx, timeout));
    const buf: string[] = [];

    for await (const chunk of res.textStream) {
        if (ctx.isAborted) break;
        if (typeof chunk === "string" && chunk.length > 0) {
            buf.push(chunk);
            safeDebug(ctx, "[PAC][stream]", chunk);
            safeNotify(ctx, "stream", chunk);
        }
    }

    const text = (await res.text) ?? buf.join("");
    const usage = await res.totalUsage;
    return { text, usage };
}

/* ------------------------------------------------------------------ *
 * 思考 providerOptions
 *
 * 对多家 provider 的通用 key 一次性填上,不认识的会被 SDK 忽略。
 * 实际是否生效取决于底层模型能力。
 * ------------------------------------------------------------------ */

const THINKING_PROVIDER_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({
    anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } },
    openai: { reasoningEffort: "medium" },
    google: { thinkingConfig: { includeThoughts: true } },
});

/* ------------------------------------------------------------------ *
 * 工具执行事件最小类型(SDK 未直接导出时的本地定义)
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * 日志/事件工具
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * 子 agent → Tool 包装
 * ------------------------------------------------------------------ */

/**
 * execute 原样返回子 agent 的最终文本;子 agent 自身 runWithInputs 会上报
 * 进入/完成及 input/output,这里不重复包装。
 *
 * 注意:子 agent 若默认开启历史(settings.history !== 0),会把每次调用的
 * 结构化 inputs 以 user 消息形式持久化到自己的历史里。工具型子 agent 应在
 * front matter 中显式声明 `history: 0`。
 */
export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    inheritedDefaults: Record<string, JsonValue> = {},
    mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    stepPath: string = compiled.name,
): Tool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = async (input: any): Promise<string> => {
        const sub = new PacAgent(compiled);
        return sub.runWithInputs(
            ctx,
            (input ?? {}) as Record<string, unknown>,
            inheritedDefaults,
            { stepPath },
            mcpClients,
        );
    };
    return tool({
        description: compiled.description,
        inputSchema: compiled.inputSchema,
        execute,
    });
}