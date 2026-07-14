import { z } from "zod";

/** P1 · 问题分析：从自由文本里提取领域情报（用于组装动态系统提示词） */
export const AnalysisSchema = z.object({
    domain: z
        .string()
        .describe("这个问题所属的领域，如：分布式系统、合同法、营养学、文案写作。"),
    task_type: z
        .string()
        .describe("任务的类型，如：方案设计、代码实现、事实解释、文本改写、决策建议。"),
    real_goal: z
        .string()
        .describe("用户提问背后真正想达成的目标，一句话。"),
    dimensions: z
        .array(
            z.object({
                name: z
                    .string()
                    .describe("这个维度的简短指代名（小写、单词间用下划线）。"),
                matters_because: z
                    .string()
                    .describe("为什么这个维度对回答好这个问题是关键的。"),
                best_practices: z
                    .array(z.string())
                    .describe("该维度下领域内公认的最佳做法或评判标准，每条独立成句。"),
                terminology: z
                    .array(z.string())
                    .describe(
                        "该维度涉及的专业术语，每条形如'术语——一句话释义'；没有则为空。"
                    ),
            })
        )
        .min(1)
        .max(5)
        .describe("回答好这个问题必须兼顾的 2~5 个正交维度。"),
    pitfalls: z
        .array(z.string())
        .describe("回答这类问题时常见的错误或坑，每条独立成句；没有则为空。"),
    ideal_answer_shape: z
        .string()
        .describe("一份好回答应当长什么样：大致结构、深度、详略取舍。"),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Dimension = Analysis["dimensions"][number];

/** P2 · 分维批判：从自由文本里提取单维度评价 */
export const CritiqueSchema = z.object({
    dimension: z.string().describe("本次批判所属的维度名。"),
    score: z
        .number()
        .min(0)
        .max(10)
        .describe("仅从本维度看，这份答案的质量分，0 到 10，越好越高。"),
    issues: z
        .array(z.string())
        .describe("从本维度发现的具体问题；没有则为空。"),
    fixes: z
        .array(z.string())
        .describe("针对上述问题的可执行修改建议；没有则为空。"),
});
export type Critique = z.infer<typeof CritiqueSchema>;

/** P3 · 精炼：从自由文本里提取成稿与改动 */
export const RefineSchema = z.object({
    refined_artifact: z
        .string()
        .describe(
            "最终要给用户的答案本身（若判断无需修改，则是与当前答案一致的完整内容），不包含分析过程。"
        ),
    changed: z.boolean().describe("相对当前答案是否做了实质性修改。"),
    changelog: z
        .array(z.string())
        .describe("做了哪些修改、分别针对哪个维度；未修改则为空。"),
});
export type Refine = z.infer<typeof RefineSchema>;