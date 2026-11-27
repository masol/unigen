// packages/main/src/libs/tooldb/tools/context/run.ts
//
// 运行一个已有的能力（capa）：loadFunctor + run。

import { loadFunctor } from "$libs/blueprint/capability/index.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";

const inputSchema = z.object({
    capaId: z
        .string()
        .min(1)
        .describe("要运行的能力 id。代码能力可由 create_code_cap 创建后获得。"),
});

export type RunCapInput = z.infer<typeof inputSchema>;

export interface RunCapOutput {
    capaId: string;
    result: string;
}

export const runCapTool: ToolDefinition<RunCapInput, RunCapOutput> = {
    name: "run_cap",
    description:
        "在当前上下文中运行一个已存在的能力（capa）。内部通过 loadFunctor 解析能力并调用 " +
        "run(ctx)，返回该能力本次运行的 final message 字符串。\n" +
        "用途：执行已持久化的能力（代码/DAG/本地能力）。\n" +
        "注意：本工具用于能力（capa），不要用来调用工具（tool）——工具请用 search_tools + invoke_tool。",
    inputSchema,
    execute: async ({ capaId }) => {
        const ctx = getRunnerContext();
        const functor = loadFunctor(ctx, capaId);
        if (!functor) {
            throw new Error(`未找到能力: ${capaId}`);
        }
        const result = await functor.run(ctx);
        return { capaId, result };
    },
};