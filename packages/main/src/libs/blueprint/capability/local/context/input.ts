import { getInput } from "$libs/blueprint/glossary/input.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";

/**
 * 加载 {{_BI_input}}。
 *
 * - inputs 非空             → 序列化 inputs（结构化调用路径）
 * - inputs 空 + 允许 body   → 回退 ctx.cmd.body / getInput()
 * - inputs 空 + 禁用 body   → "{}"（子 agent 被父调用时，防止读取父的幽灵 ctx.cmd.body）
 *
 * 判定使用 `=== undefined || === null` 而非 `!input`：
 * 空字符串是合法的用户输入（如 user_message=""），应原样作为 `_BI_input`，
 * 而不是触发下方的旧路径告警。
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

    const input = ctx.cmd?.body;
    if (input !== undefined && input !== null) {
        return input;
    }

    Logger.error(
        "旧代码访问？新机制下，用户输入都是从ctx.cmd.body处获取，" +
        "而不是从kv-store,请报告问题!",
    );
    const got = getInput(ctx, "script");
    return got.length > 0 ? got.join("\n") : "";
}