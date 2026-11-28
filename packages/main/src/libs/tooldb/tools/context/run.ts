// packages/main/src/libs/tooldb/tools/context/run.ts
//
// 运行一个已有的能力（capa）：loadFunctor + run。
//
// user_message 语义：
// - 通过 CapaRunInput.input 传给目标 functor；由 resolveRunEnv → parseCommandWithBody
//   解析为 CommandInfo，覆盖到作用域内 ctx.cmd。
// - run_cap 固定传 isRoot: false（不写 message 表、不发 message.* 事件、读快照内存历史），
//   同时 allowBodyFallback: true（作用域 ctx.cmd.body = user_message，可以进入 _BI_input）。
// - 纯文本 user_message → 作用域 ctx.cmd.body 即为该文本；/cmd 前缀时，args 进入 inputs，
//   body 进入 ctx.cmd.body。两条路径都可用。

import { loadFunctor } from "$libs/blueprint/capability/index.js";
import type { CapaRunInput } from "$libs/blueprint/capability/type.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";

const inputSchema = z.object({
    capaId: z
        .string()
        .min(1)
        .describe(
            "要运行的能力 id。可为 create_code_cap 返回的代码能力 id、" +
            "已存在的 DAG 能力 id，或 `#localtype::<path>` 形式的本地 agent " +
            "（例如 `#localtype::pac/agents/foo.md` 或 `#localtype::agent-system/index.md`，" +
            "由项目上下文解析路径）。"
        ),
    user_message: z
        .string()
        .describe(
            "必填。作为本次运行的**用户消息（user message）**注入目标 capa，覆盖外层会话的 ctx.cmd。" +
            '允许空字符串以表达"本次运行无用户输入"。\n' +
            "解析规则（与用户直接输入一致）：\n" +
            "- 普通文本 → 整段作为 `_BI_input`(用户消息)；\n" +
            "- 首行以 `/` 开头 → 首行被解析为命令名与参数，args 进入目标 agent 的 inputs，" +
            "  其后行为 `_BI_input` 的 body；命令名本身在本地 agent 场景下会被忽略。"
        ),
    files: z
        .array(z.string())
        .optional()
        .describe(
            "可选。作为本次运行的附件路径列表，会覆盖外层会话的 ctx.files；" +
            "省略时为空附件。"
        ),
});

export type RunCapInput = z.infer<typeof inputSchema>;

export interface RunCapOutput {
    capaId: string;
    result: string;
}

export const runCapTool: ToolDefinition<RunCapInput, RunCapOutput> = {
    name: "run_cap",
    description:
        "运行一个已保存的能力（capa），返回它本轮运行的 final message 字符串。\n" +
        "capaId 有三类来源：\n" +
        "1) create_code_cap 返回的代码能力 id；\n" +
        "2) 已存在的 DAG 能力 id；\n" +
        "3) `#localtype::<path>`：启动一个本地文件定义的多 agent 系统，" +
        "path 由项目上下文解析（如 `pac/agents/foo.md` 或 `agent-system/index.md`）。\n" +
        "执行时按 id 类型自动选择解释器并运行。\n" +
        "必填参数 user_message：作为本次运行的 user 消息注入目标 capa，覆盖外层会话的 ctx（允许空字符串）。\n" +
        "可选参数 files：作为本次运行的附件路径列表，覆盖外层会话的 ctx.files（省略时为空附件）。\n" +
        "user_message 与 files 均仅作用于本次调用，不影响外层会话的 ctx，也不写入当前会话历史；" +
        "因此 run_cap 适合\"隔离地试跑一个 cap\"，不适合\"把它接入当前对话轮次\"。\n" +
        "注意：cap 是能力（可执行单元），不是工具；要发现和调用工具请使用 search_tools + invoke_tool。",
    inputSchema,
    execute: async ({ capaId, user_message, files }) => {
        const ctx = getRunnerContext();
        const functor = loadFunctor(ctx, capaId);
        if (!functor) {
            throw new Error(`未找到能力: ${capaId}`);
        }
        // isRoot:false —— 以 sub-agent 语义运行：不写会话历史、不发 message.* 事件。
        // allowBodyFallback:true —— 因为作用域 ctx.cmd 已经指向本轮 user_message，
        //   `_BI_input` 可以直接读它，把 user_message（含纯文本）送达目标 agent。
        // files ?? [] —— 省略 files 即空附件，而非回退到外层 ctx.files。
        const runInput: CapaRunInput = {
            input: user_message,
            files: files ?? [],
            isRoot: false,
            allowBodyFallback: true,
        };
        const result = await functor.run(ctx, runInput);
        return { capaId, result };
    },
};