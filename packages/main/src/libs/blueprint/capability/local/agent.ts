import { getSmartModel } from "$libs/model/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { ToolLoopAgent, isStepCount, tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { getErrorMessage } from "radashi";
import { buildUserPrompt, renderSystemPrompt } from "./template.js";
import type { CompiledPacAgent, IPacAgent } from "./type.js";

/**
 * PAC Agent 运行时。
 *
 * CompiledPacAgent 是纯数据树(编译期产物,与 ctx 无关);
 * PacAgent 是 compiled + ctx 的绑定体,具备执行能力。
 * 同一个 CompiledPacAgent 可为不同 ctx 生成不同的 Tool 实例(闭包捕获)。
 */
export class PacAgent implements IPacAgent {
    constructor(private readonly compiled: CompiledPacAgent) { }

    getCompiled(): CompiledPacAgent {
        return this.compiled;
    }

    /** 顶层入口:从 ctx.cmd 提取 inputs 后运行 */
    async run(ctx: IRunnerContext): Promise<string> {
        return this.runWithInputs(ctx, this.inputsFromCtx(ctx));
    }

    /**
     * 以显式 inputs 运行。
     * 被父 agent 作为 tool 调用时走这里 —— 结构递归的执行体现。
     */
    async runWithInputs(
        ctx: IRunnerContext,
        rawInputs: Record<string, unknown>,
    ): Promise<string> {
        if (ctx.isAborted) return "";

        // 输入校验:失败不阻断,降级为原值让 LLM 自行看错误信息
        const parsed = this.compiled.inputSchema.safeParse(rawInputs);
        if (!parsed.success) {
            Logger.warn(
                `[PAC] ${this.compiled.name} 输入校验失败:`,
                parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`),
            );
        }
        const inputs = parsed.success
            ? (parsed.data as Record<string, unknown>)
            : rawInputs;

        const tools = this.materializeTools(ctx);
        const system = await renderSystemPrompt(this.compiled, ctx, inputs);
        const prompt = await buildUserPrompt(this.compiled, ctx, inputs);

        const agent = new ToolLoopAgent({
            model: getSmartModel(undefined, ctx),
            instructions: system,
            stopWhen: isStepCount(this.compiled.config.maxSteps ?? 10),
            tools,
        });

        Logger.debug(`[PAC] run ${this.compiled.name} (tools: ${Object.keys(tools).length})`);
        const result = await agent.generate({ prompt });
        return result.text ?? "";
    }

    /**
     * 物化 ToolSet:外部工具直用,子 agent 用当前 ctx 现场包成 Tool。
     * 这是递归结构在运行期的关键 —— 整棵树共享同一 ctx,
     * abort / prj / cmd 栈等语义天然向下传递。
     */
    private materializeTools(ctx: IRunnerContext): Record<string, Tool> {
        const out: Record<string, Tool> = {};
        for (const ref of this.compiled.toolRefs) {
            if (ref.origin === "agent" && ref.agent) {
                out[ref.key] = buildAgentTool(ref.agent, ctx);
            } else if (ref.tool) {
                out[ref.key] = ref.tool;
            }
        }
        return out;
    }

    private inputsFromCtx(ctx: IRunnerContext): Record<string, unknown> {
        const args = (ctx.cmd?.args as Record<string, unknown> | undefined) ?? {};
        const out: Record<string, unknown> = { ...args };
        if (typeof ctx.cmd?.body === "string" && !("body" in out)) {
            out.body = ctx.cmd.body;
        }
        return out;
    }
}

/**
 * 把一个 CompiledPacAgent 包装为 AI SDK Tool —— 递归的关键接口。
 *
 * - inputSchema  = agent 的 front matter.inputs(JSON Schema 转出的 zod)
 * - outputSchema = agent 的 front matter.outputs(可选)
 * - execute      = 以结构化输入跑一次子 agent,输出按 outputSchema 解析
 *
 * ctx 由闭包捕获,保证嵌套调用与父调用处于同一运行上下文。
 *
 * 实现注意:tool() 的类型是通过参数字面量推断的,outputSchema 一旦缺省,
 * 类型就会被锁为"无 outputSchema"的分支,此时再 spread 加字段会不兼容。
 * 因此下面用两个分支分别写完整 object literal,各自从字面量独立推断。
 */
export function buildAgentTool(
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
): Tool {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execute = async (input: any): Promise<unknown> => {
        const sub = new PacAgent(compiled);
        const text = await sub.runWithInputs(
            ctx,
            (input ?? {}) as Record<string, unknown>,
        );

        if (!compiled.outputSchema) return text;

        try {
            const obj = JSON.parse(text);
            const ok = compiled.outputSchema.safeParse(obj);
            if (ok.success) return ok.data;
            Logger.warn(
                `[PAC] 子 agent ${compiled.name} 输出不符合 schema:`,
                ok.error.issues.map((i) => `${i.path.join(".")} ${i.message}`),
            );
        } catch (e) {
            Logger.warn(
                `[PAC] 子 agent ${compiled.name} 输出非合法 JSON: ${getErrorMessage(e)}`,
            );
        }
        return { _raw: text };
    };

    if (compiled.outputSchema) {
        return tool({
            description: compiled.description,
            inputSchema: compiled.inputSchema,
            outputSchema: compiled.outputSchema,
            execute,
        }) as Tool;
    }

    return tool({
        description: compiled.description,
        inputSchema: compiled.inputSchema,
        execute,
    }) as Tool;
}