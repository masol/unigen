import { z } from "zod";

/**
 * 工具检索输入。
 *
 * - query 为空字符串时表示枚举全部可用工具；
 * - offset / limit 用于分页；
 * - 不暴露 mode / scope / disableRerank：这些能力当前不由 GlobalToolDB 对外承诺。
 */
export const toolSearchInputSchema = z.object({
    query: z.string().trim().max(500).default(""),
    limit: z.number().int().positive().max(100).default(20),
    offset: z.number().int().nonnegative().default(0),
});

export const toolSearchItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    rerankScore: z.number().optional(),
});

export const toolSearchOutputSchema = z.object({
    items: z.array(toolSearchItemSchema),
    hasMore: z.boolean(),
});

export type ToolSearchInput = z.infer<typeof toolSearchInputSchema>;
export type ToolSearchItem = z.infer<typeof toolSearchItemSchema>;
export type ToolSearchOutput = z.infer<typeof toolSearchOutputSchema>;