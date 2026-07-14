import { z } from "zod";

/** S1 · 棱面拆分：从自由文本里提取评估视角 */
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

/** S2 · 分面批判：从自由文本里提取单视角评价 */
export const CritiqueSchema = z.object({
    facet: z.string().describe("本次批判所属的视角名。"),
    score: z
        .number()
        .min(0)
        .max(10)
        .describe("仅从本视角看，这份答案的质量分，0 到 10，越好越高。"),
    issues: z.array(z.string()).describe("从本视角发现的具体问题；没有则为空。"),
    fixes: z.array(z.string()).describe("针对上述问题的可执行修改建议；没有则为空。"),
});
export type Critique = z.infer<typeof CritiqueSchema>;

/** S3 · 合并精炼：从自由文本里提取成稿与改动 */
export const RefineSchema = z.object({
    refined_artifact: z
        .string()
        .describe(
            "最终要给用户的答案本身（若判断无需修改，则返回空字符串），不包含分析过程。"
        ),
    changed: z.boolean().describe("相对当前答案是否做了实质性修改。"),
    changelog: z
        .array(z.string())
        .describe("做了哪些修改、分别针对哪个视角；未修改则为空。"),
});
export type Refine = z.infer<typeof RefineSchema>;