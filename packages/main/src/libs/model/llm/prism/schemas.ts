import { z } from "zod";

/** S1 · 棱面拆分：全流程唯一一次结构化提取（代码需要 facet 列表来派发并发批判） */
export const FacetsSchema = z.object({
    facets: z
        .array(
            z.object({
                name: z
                    .string()
                    .describe("这个评估视角的简短指代名（小写、单词间用下划线）。"),
                checks_what: z.string().describe("这个视角具体检查答案的哪一方面。"),
                why: z.string().describe("为什么这个视角对本题关键、且与其它视角不重叠。"),
            })
        )
        .min(1)
        .max(5)
        .describe("评估该答案好坏的 2~5 个正交视角。"),
});
export type Facets = z.infer<typeof FacetsSchema>;
export type Facet = Facets["facets"][number];

/** S2 · 分面批判：自然语言评审稿，代码不解析内容，仅回填视角名用于拼接精炼提示。 */
export interface FacetCritique {
    facet: string;
    text: string;
}