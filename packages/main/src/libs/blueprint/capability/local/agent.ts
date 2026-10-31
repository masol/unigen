import { getSmartModel } from "$libs/model/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { ToolLoopAgent, isStepCount, tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { buildUserPrompt, renderSystemPrompt } from "./template.js";
import type { CompiledPacAgent, IPacAgent, JsonValue } from "./type.js";

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
 */
export class PacAgent implements IPacAgent {
    constructor(private readonly compiled: CompiledPacAgent) { }
    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }
    /** 顶层入口:标记 isRoot,允许 _BI_input 回退到 ctx.cmd.body。 */
    async run(ctx: IRunnerContext): Promise<string> {
        return this.runWithInputs(
            ctx,
            this.inputsFromCtx(ctx),
            {},
            { validateInputs: false, isRoot: true },
        );
    }
    /**
     * 以显式 inputs + 可选 inheritedDefaults 运行。
     *
     * @param options.isRoot 仅由 run() 自身传 true;父 agent 把当前 agent 作为
     *   子工具调用时(buildAgentTool.execute → 本方法)**不要**传,保持默认 false,
     *   以避免 _BI_input 错位回退到根上下文的 body。
     */
    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
        inheritedDefaults: Record<string, JsonValue> = {},
        options: { validateInputs?: boolean; isRoot?: boolean } = {},
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
        const tools = this.materializeTools(ctx, effectiveDefaults);
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
     *  - 外部工具直取 meta.tool(编译期已预物化,与 ctx 无关)。
     *  - 子 agent 用当前 ctx + 当前 effectiveDefaults 现场包成 Tool:
     *    父的 effective 即是子的 inherited,实现默认值跨层继承。
     */
    private materializeTools(
        ctx: IRunnerContext,
        parentDefaults: Record<string, JsonValue>,
    ): Record<string, Tool> {
        const out: Record<string, Tool> = {};
        for (const ref of this.compiled.toolRefs) {
            if (ref.origin === "agent" && ref.agent) {
                out[ref.key] = buildAgentTool(ref.agent, ctx, parentDefaults);
            } else if (ref.meta) {
                out[ref.key] = ref.meta.tool;
            }
        }
        return out;
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
 */
export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    inheritedDefaults: Record<string, JsonValue> = {},
): Tool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = async (input: any): Promise<string> => {
        const sub = new PacAgent(compiled);
        return sub.runWithInputs(
            ctx,
            (input ?? {}) as Record<string, unknown>,
            inheritedDefaults,
        );
    };
    return tool({
        description: compiled.description,
        inputSchema: compiled.inputSchema,
        execute,
    });
}