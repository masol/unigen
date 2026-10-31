import { getSmartModel } from "$libs/model/index.js";
import { globalToolDB } from "$libs/tooldb/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { ToolLoopAgent, isStepCount, tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { connectLocalMcp, type LocalMcpClient } from "./mcp.js";
import { buildUserPrompt, renderSystemPrompt } from "./template.js";
import type { CompiledPacAgent, IPacAgent, JsonValue, LocalMcpConfig } from "./type.js";

/**
 * PAC Agent 运行时。
 *
 * CompiledPacAgent 是纯数据树(编译期产物,与 ctx 无关);
 * PacAgent 是 compiled + ctx 的绑定体,具备执行能力。
 *
 * **对话展开模型:**
 *  - system 消息 = systemTemplate 渲染结果
 *  - user   消息 = userTemplate   渲染结果(默认 `{{_BI_input}}`)
 *
 * ============================================================
 *  子 agent 的工具返回:原样文本,不解析、不校验、不装箱
 * ============================================================
 *
 * 设计决策,务必保持:
 *
 * 1. **不强制子 agent 返回 JSON**。大量实证表明:强制 LLM 以严格结构输出
 *    会显著降低推理质量——它要一边思考业务、一边当序列化器。
 *    改为:编译期把 outputs schema 转成"最终回复要点"清单追加到子 agent
 *    自身 system prompt 末尾(见 compiler.ts),让它用自然语言汇报即可。
 *    父 agent 的 LLM 直接阅读文本理解,比先 JSON 再反序列化更稳。
 *
 * 2. **工具执行抛错不吞、不装箱**。buildAgentTool.execute 直接 await 并返回;
 *    若内部抛错,异常冒泡到 AI SDK,SDK 会将其作为 `tool-error` 结果消息
 *    写入父 agent 的对话上下文,父 LLM 自然看到并决策重试/改走路径。
 *    自己构造 `{ _pacError: ... }` 这种错误对象,反而让父 LLM 需要同时识别
 *    "成功文本"和"失败对象"两种形状,拖累对话质量。
 *
 * 3. **inputSchema 校验**保留但仅作诊断日志,不改变执行流;AI SDK 自身也会校验。
 *
 * 4. **outputSchema 在运行期不使用**;仅编译期用于:
 *      a) 生成"最终回复要点"追加到自身 system prompt;
 *      b) 在父 agent 的工具目录里渲染"返回语义"描述。
 *
 * **_BI_input 的根/子分流**:见 vars.ts::loadInputVar。
 *
 * **_T_ 变量默认值继承:**
 *  effectiveDefaults = { ...inheritedDefaults, ...ownDefaults }
 *
 * **局部 MCP 连接管理:**
 *  按 transport 配置对象分组,同一配置只连接一次;运行结束后统一关闭。
 *  mcpClients 用 Map<config, client> 管理,保证资源不泄漏。
 */
export class PacAgent implements IPacAgent {
    constructor(private readonly compiled: CompiledPacAgent) { }

    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }

    /** 顶层入口:标记 isRoot,允许 _BI_input 回退到 ctx.cmd.body。 */
    async run(ctx: IRunnerContext): Promise<string> {
        const mcpClients = new Map<LocalMcpConfig, LocalMcpClient>();
        try {
            return await this.runWithInputs(
                ctx,
                this.inputsFromCtx(ctx),
                {},
                { validateInputs: false, isRoot: true },
                mcpClients,
            );
        } finally {
            await this.closeLocalMcpClients(mcpClients);
        }
    }

    /**
     * 以显式 inputs + 可选 inheritedDefaults 运行。
     *
     * @param options.isRoot 仅由 run() 自身传 true;父 agent 把当前 agent 作为
     *   子工具调用时(buildAgentTool.execute → 本方法)**不要**传,保持默认 false,
     *   以避免 _BI_input 错位回退到根上下文的 body。
     * @param mcpClients 局部 MCP 连接池,由顶层 run() 创建并传递,保证资源统一清理。
     */
    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue> = {},
        options: { validateInputs?: boolean; isRoot?: boolean } = {},
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    ): Promise<string> {
        if (ctx.isAborted) return "";
        const validateInputs = options.validateInputs ?? true;
        const isRoot = options.isRoot ?? false;

        let inputs: Record<string, unknown> = rawInputs;
        if (validateInputs) {
            const parsed = this.compiled.inputSchema.safeParse(rawInputs);
            if (!parsed.success) {
                Logger.warn(
                    `[PAC] ${this.compiled.name} 输入校验失败(将以原值运行):`,
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
        const tools = await this.materializeTools(ctx, effectiveDefaults, mcpClients);
        const system = await renderSystemPrompt(
            this.compiled, ctx, inputs, effectiveDefaults, isRoot,
        );
        const prompt = await buildUserPrompt(
            this.compiled, ctx, inputs, effectiveDefaults, isRoot,
        );
        Logger.debug(
            `[PAC] run ${this.compiled.name} ` +
            `(tools: ${Object.keys(tools).length}, validateInputs: ${validateInputs}, isRoot: ${isRoot})\n` +
            `────────── SYSTEM PROMPT (${this.compiled.name}) ──────────\n` +
            `${system}\n` +
            `────────── USER PROMPT (${this.compiled.name}) ──────────\n` +
            `${prompt}\n` +
            `────────────────────────────────────────────────────────`,
        );
        const agent = new ToolLoopAgent({
            model: getSmartModel(undefined, ctx),
            instructions: system,
            stopWhen: isStepCount(this.compiled.config.maxSteps ?? 10),
            tools,
        });
        const result = await agent.generate({ prompt });
        return result.text ?? "";
    }

    /**
     * 物化 ToolSet:
     *  - 外部工具(builtin/search/mcp_global):运行期按 id 从 globalToolDB 取最新实例
     *  - 局部 MCP:按 config 分组连接,同一 config 只连接一次,client 存入 mcpClients
     *  - 子 agent:用当前 ctx + 当前 effectiveDefaults 现场包成 Tool,传递 mcpClients
     *  - 技能工具(load_skill/read_skill_file):直接取编译期物化的 tool
     */
    private async materializeTools(
        ctx: IRunnerContext,
        parentDefaults: Record<string, JsonValue>,
        mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
    ): Promise<Record<string, Tool>> {
        const out: Record<string, Tool> = {};
        for (const ref of this.compiled.toolRefs) {
            if (ref.agent) {
                out[ref.key] = buildAgentTool(ref.agent, ctx, parentDefaults, mcpClients);
            } else if (ref.local) {
                out[ref.key] = ref.local.tool;
            } else if (ref.mcpLocal) {
                // 局部 MCP:按 config 分组,同一配置只连一次
                const { config, tool: info } = ref.mcpLocal;
                let client = mcpClients.get(config);
                if (!client) {
                    try {
                        client = await connectLocalMcp(config);
                        mcpClients.set(config, client);
                    } catch (e) {
                        Logger.error(
                            `[PAC] ${this.compiled.name}: 局部 MCP 连接失败，跳过工具 ${ref.key}`,
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
                        `[PAC] ${this.compiled.name}: 局部 MCP 工具 ${info.name} 未找到，跳过`,
                    );
                }
            } else if (ref.meta) {
                // 全局工具:运行期取最新实例
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

    /**
     * 顶层入口的入参装配。只透传 ctx.cmd.args(来自 UI 的结构化参数)。
     * 用户原始文本 ctx.cmd.body 不在这里注入 —— 它由默认 userTemplate
     * `{{_BI_input}}` 在 inputs 为空时经 loadInputVar 兜底读取。
     * 这个"body fallback"仅对根调用启用,子 agent 调用严禁回退(见 loadInputVar)。
     */
    private inputsFromCtx(ctx: IRunnerContext): Record<string, unknown> {
        const args = (ctx.cmd?.args as Record<string, unknown> | undefined) ?? {};
        return { ...args };
    }
}

/**
 * 把 CompiledPacAgent 包装为 AI SDK Tool —— 递归的关键接口。
 *
 * execute 原样返回子 agent 的最终文本:
 *   - 不做 JSON 提取、不做 outputSchema 校验、不构造错误对象;
 *   - 异常自然冒泡至 AI SDK,SDK 自动转为 tool-error 消息送回父对话。
 *
 * 若未来需要给某类子 agent 的返回文本做"后处理"(如摘录某段),
 * 应在模板层做,不要回到这里加包装 —— 包装层越薄,行为越可预测。
 *
 * mcpClients 由顶层 run() 创建并传递,子 agent 的局部 MCP 连接会复用同一 Map,
 * 保证资源统一清理且不泄漏。
 */
export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    inheritedDefaults: Record<string, JsonValue> = {},
    mcpClients: Map<LocalMcpConfig, LocalMcpClient>,
): Tool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = async (input: any): Promise<string> => {
        const sub = new PacAgent(compiled);
        return sub.runWithInputs(
            ctx,
            (input ?? {}) as Record<string, unknown>,
            inheritedDefaults,
            {},
            mcpClients,
        );
    };
    return tool({
        description: compiled.description,
        inputSchema: compiled.inputSchema,
        execute,
    });
}