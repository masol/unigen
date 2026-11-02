import { getInput } from "$libs/blueprint/glossary/input.js";
import type { IRunnerContext } from "$types/blueprint/context.js";

/**
 * 加载 {{_BI_input}}。
 *
 * - 根调用 + inputs 非空 → 序列化 inputs
 * - 根调用 + inputs 空   → 回退 ctx.cmd.body / getInput()
 * - 子 agent 调用        → 只序列化 inputs,绝不借用根 body(避免幽灵上下文)
 */
export async function loadInputVar(
    ctx: IRunnerContext,
    inputs: Record<string, unknown>,
    allowBodyFallback = false,
): Promise<string> {
    if (inputs && Object.keys(inputs).length > 0) {
        return JSON.stringify(inputs, null, 2);
    }

    if (!allowBodyFallback) {
        return "{}";
    }

    let input = ctx.cmd?.body;
    if (!input) {
        const got = getInput(ctx, ctx.prj.inputName ?? "script");
        input = got.length > 0 ? got.join("\n") : "";
    }
    return input;
}