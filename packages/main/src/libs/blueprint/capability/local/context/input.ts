import { getInput } from "$libs/blueprint/glossary/input.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";

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
        Logger.error("旧代码访问？新机制下，用户输入都是从ctx.cmd.body处获取，而不是从kv-store,请报告问题!")
        const got = getInput(ctx, "script");
        input = got.length > 0 ? got.join("\n") : "";
    }
    return input;
}