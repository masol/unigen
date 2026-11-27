// packages/main/src/libs/tooldb/tools/memory/code_cap.ts
//
// 创建/更新「代码能力」。
//
// 注意：下面 description 中关于 VM 运行时的说明（agent 签名、可用 model 解析器、
// code cap 的命名约定）需要你确认后替换 —— 见回复末尾的「需要你确认的信息」。

import { makeCodeName } from "$libs/blueprint/capability/is.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import type { NewCapability } from "$types/blueprint/capability.js";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";

const inputSchema = z.object({
    name: z
        .string()
        .min(1)
        .describe(
            "能力名。需符合项目内代码能力（code cap）的命名约定，否则运行时无法识别为代码节点。",
        ),
    code: z
        .string()
        .min(1)
        .describe(
            "能力代码（JS/TS）。必须自包含，最终返回一个字符串作为本次运行的 final message。",
        ),
    id: z
        .string()
        .min(1)
        .optional()
        .describe("更新已有能力时传入原 id；省略则新建。"),
});

export type CreateCodeCapInput = z.infer<typeof inputSchema>;

export interface CreateCodeCapOutput {
    id: string;
    name: string;
    created: boolean;
}

export const createCodeCapTool: ToolDefinition<
    CreateCodeCapInput,
    CreateCodeCapOutput
> = {
    name: "create_code_cap",
    description:
        "创建或更新一个「代码能力」（code capability）。代码能力是被持久化到项目数据库、" +
        "在调用时于沙箱 VM 中执行的 JS/TS 程序；由 run_cap 按 id 触发。\n" +
        "入参：name（须符合代码能力命名约定）、code（程序正文）、可选 id（更新已有能力）。\n" +
        "运行时（Vercel AI SDK v7）：\n" +
        "- 文本生成：generateText({ model, prompt, tools, stopWhen })、streamText(...)\n" +
        "- 结构化生成：generateObject({ model, schema, prompt })\n" +
        "- 工具定义：tool({ description, inputSchema, execute })\n" +
        "- 停止条件：stepCountIs(n)、hasToolCall(name)\n" +
        "- 子 agent：agent(...)（用于把子任务委托给另一个 agent）\n" +
        "- 模型解析器：使用项目提供的 model 获取函数（如 getModel / getSmartModel）。\n" +
        "编写要求：\n" +
        "1) 代码自包含，不依赖外部导入时的隐式变量；\n" +
        "2) 始终 return 一个可读的字符串作为 final message；\n" +
        "3) 有副作用（写文件/发请求）时优先通过工具完成，不直接调用未暴露的 API；\n" +
        "4) 处理异常并返回错误说明，不要静默吞掉。\n" +
        "若只需更新元数据或不含代码的能力，请改用 data_store(kind=capa)。",
    inputSchema,
    execute: async ({ name, code, id }) => {
        const ctx = getRunnerContext();
        const db = PrjDB.ensure(ctx.prj);

        const capa: NewCapability = {
            name: makeCodeName(name),
            code,
            ...(id ? { id } : {}),
        };
        const capaId = db.upcertCapa(capa);

        return {
            id: capaId,
            name,
            created: !id,
        };
    },
};