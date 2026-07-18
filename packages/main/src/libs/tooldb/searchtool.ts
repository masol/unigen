import { tool, type Tool } from "ai";
import { z } from "zod";
import { globalToolDB } from "./globaltooldb.js";
export const searchToolsToolName = "search_tools";

/**
 * 把"自然语言检索工具"本身包装成一个 AI SDK Tool。
 * 挂到 LLM 后,LLM 可自行发现有哪些工具可用,再据此生成工具流。
 * 返回结果带 id —— 工具流定义中应引用 id(跨重启稳定),而不是 name。
 */
export const searchTool: Tool = tool({
    description:
        "用自然语言检索当前可用的工具。描述你想完成的动作(而非工具名)," +
        "返回按相关度排序的工具列表,每项含 id/name/description。" +
        "生成工具流或后续引用某个工具时,必须使用返回的 id 字段。",
    inputSchema: z.object({
        query: z
            .string()
            .min(1)
            .describe("要完成的动作的自然语言描述,例如:'抓取网页内容并转为 markdown'"),
        limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe("最多返回的工具数,默认 8"),
    }),
    execute: async ({ query, limit }) => {
        const hits = await globalToolDB.searchTools(query, { limit: limit ?? 8 });
        if (hits.length === 0) {
            return { tools: [], hint: "没有找到相关工具,可尝试换一种描述方式。" };
        }
        return {
            tools: hits.map((h) => ({
                id: h.id,
                name: h.name,
                description: h.description,
                source: h.source,
            })),
        };
    },
});