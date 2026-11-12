// packages/main/src/libs/tooldb/tools/meta-tools/search.ts
import { z } from "zod";
import { buildAiTool } from "../../builder.js";
import { globalToolDB } from "../../globaltooldb.js";
import type { ToolDefinition, ToolMeta } from "../../type.js";
import { invokeToolName, searchToolsToolName } from "./names.js";
import type { SchemaNode } from "./schema.js";
import {
    describeSchema,
    getInputSchema,
    getOutputSchema,
} from "./schema.js";

export { searchToolsToolName };

const searchInputSchema = z.object({
    query: z
        .string()
        .min(1)
        .describe(
            "要完成的动作的自然语言描述，例如：'抓取网页内容并转为 markdown'",
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("最多返回的工具数，默认 8"),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export interface InvocationSpec {
    callWith: string;
    args: string;
    inputSchema: SchemaNode | string;
    outputSchema: SchemaNode | string;
    rules: string[];
}

export interface SearchOutput {
    tools: Array<{
        /**
         * 全局唯一调用标识；invoke_tool 的入参 id 必须原样填这个完整 id，
         * 形如 builtin::xxx / mcp::serverId::name。
         */
        id: string;
        /** 原始工具名（自然语言），仅用于人类/LLM 阅读 */
        name: string;
        description: string;
        source: string;
        /**
         * 启用 Rerank 时的精排分数，越大越相关；未启用时不出现。
         *
         * 仅供框架/调用方参考相关度；是排序信号，不具备跨查询可比性，
         * 不要基于此字段做“是否相关”的绝对判断。
         */
        score?: number;
        invocation: InvocationSpec;
    }>;
    guidance?: string;
    hint?: string;
}

async function buildInvocationSpec(meta: ToolMeta): Promise<InvocationSpec> {
    const inputSchema = await describeSchema(getInputSchema(meta));
    const outputSchema = await describeSchema(getOutputSchema(meta));

    return {
        callWith: invokeToolName,
        args:
            "args 必须是符合 inputSchema 的单个 JSON 对象；" +
            "调用 invoke_tool 时 id 必须原样使用 search_tools 返回的完整 id" +
            "（形如 builtin::xxx / mcp::serverId::name），不要用 name 或 llmName。",
        inputSchema:
            inputSchema ??
            "未声明：请严格依据 description 组织参数，并先最小化调用验证。",
        outputSchema:
            outputSchema ??
            "未声明：输出无需按 schema 验证，以实际返回为准。",
        rules: [
            "先阅读 inputSchema，再组织 args。",
            "不要编造字段；必填字段必须提供。",
            "参数验证失败时按返回的 issues 重新组织 args。",
            "必须通过 invoke_tool 执行，不要直接调用真实工具。",
        ],
    };
}

const NO_RESULT_HINT =
    "没有找到匹配的工具。这通常意味着该能力在当前工具集中**不存在**，" +
    "而不是关键词不够准确——请**不要**用同义关键词反复重试。" +
    "请换一个思路：重新审视任务目标，构造新的工具链假设" +
    "（例如把目标拆解为其它可组合的能力，或改写为可被现有工具覆盖的子任务），" +
    "再据此发起一次搜索；也可以判断该任务是否需要新的工具/外部能力。" +
    "只有在确实怀疑是关键词覆盖不足时，才用**明显不同**的能力描述再搜一次。";

export const searchToolDef: ToolDefinition<SearchInput, SearchOutput> = {
    name: searchToolsToolName,
    description:
        "用自然语言检索当前可用的工具。描述你想完成的动作（而非工具名）。" +
        "建议一次并行发起多个 search_tools 调用，每个调用聚焦一个能力/意图，" +
        "再合并返回的工具集并据此调整策略；不要只搜一个宽泛词就停止。" +
        "返回按相关度排序的工具列表，每项含 id/name/description/invocation；" +
        "id 是全局唯一调用标识（形如 builtin::xxx 或 mcp::serverId::name），" +
        "调用具体工具时必须把返回的 id 原样传给 invoke_tool，不要用 name 或 llmName 代替。" +
        "启用 Rerank 时还会带 score（仅作参考，不具备跨查询可比性）。",
    inputSchema: searchInputSchema,
    execute: async ({ query, limit }) => {
        const hits = await globalToolDB.searchTools(query, {
            limit: limit ?? 8,
        });

        if (hits.length === 0) {
            return {
                tools: [],
                hint: NO_RESULT_HINT,
            };
        }

        const tools = await Promise.all(
            hits.map(async (meta) => ({
                id: meta.id,
                name: meta.name,
                description: meta.description,
                source: meta.source,
                ...(typeof meta.rerankScore === "number"
                    ? { score: meta.rerankScore }
                    : {}),
                invocation: await buildInvocationSpec(meta),
            })),
        );

        return {
            tools,
            guidance:
                "可一次并行发起多个 search_tools 调用，每个调用聚焦一个能力/意图，" +
                "再合并工具集调整策略。实际调用工具时必须使用 invoke_tool，" +
                "并把本工具返回的 id 原样传入（形如 builtin::xxx / mcp::serverId::name）；" +
                "以 invocation.inputSchema 为准组织 args；不要凭 name/description 猜测参数。" +
                "score 仅作相关度参考，不具备跨查询可比性，不要作为判断是否相关的绝对依据。",
        };
    },
};

export const searchTool = buildAiTool(searchToolDef);