import type { Critique, Dimension } from "./schemas.js";

/**
 * 全部提示词只表达"要什么语义"，不含任何输出格式/字段要求——
 * 模型自由格式思考与表达，结构由 NL2Format 按 schema 自动抽取。
 * system 固定写死，user 只注入参数。
 */

// ── P1 · 问题分析（拆维度 + 收集术语/最佳方法）──────────────────
export const ANALYZE_SYSTEM = `你是领域侦察员。在别人动手回答一个问题之前，你先替他把这个问题"侦察"清楚，让他能以领域专家的水准作答。

给定一个用户问题，请想清楚这些事：

它属于什么领域、是什么类型的任务？用户提这个问题，背后真正想达成的是什么？

要回答好它，必须同时兼顾哪几个彼此不重叠的维度？对每个维度：为什么它关键；这个领域里公认的最佳做法或评判标准是什么；涉及哪些专业术语——把术语连同它的含义一起说清，让不熟悉该领域的人也能正确使用它们。

回答这类问题的人常犯什么错、常掉进什么坑？

最后，一份真正好的回答应当长什么样——大致的结构、该深到什么程度、哪里详哪里略。

宁少勿滥：维度之间不要重叠，可有可无的不要列；术语和最佳做法要贴着这个具体问题来，不要堆砌领域内不相关的名词。你只负责侦察，不要开始回答问题本身。`;

export function analyzeUser(query: string): string {
    return `用户问题：
"""
${query}
"""

请侦察这个问题：领域、任务类型、真实目标、关键维度（含各维度的最佳做法与专业术语）、常见的坑、以及一份好回答应有的样子。`;
}

// ── P2 · 分维批判（参数化单模板，所有维度共用）───────────────────
export function critiqueSystem(dim: Dimension): string {
    const practices = dim.best_practices.length
        ? `这个维度下公认的标准是：${dim.best_practices.join("；")}。`
        : "";
    return `你是"${dim.name}"这一个维度的专职评审。只从这一个维度审查答案，不要越界去评论其它维度的问题。${practices}

审查时，始终对照用户真正想要的是什么，不要脱离原始问题空谈。请说清楚：单从这个维度看，这份答案做得怎么样、存在哪些具体而且能定位到的问题、以及每个问题应该怎么改。

如果从这个维度看确实没有问题，就如实说它没问题，不要为了凑内容硬找毛病。`;
}

export function critiqueUser(
    query: string,
    draft: string,
    dim: Dimension
): string {
    return `原始问题：
"""
${query}
"""

你这个维度的关注点：${dim.matters_because}

待审查的答案：
"""
${draft}
"""`;
}

// ── P3 · 精炼（仅一轮）──────────────────────────────────────────
export const REFINE_SYSTEM = `你是精炼器。你会拿到原始问题、一份当前答案、以及多个维度对它的批判意见。

请综合这些意见，判断当前答案是不是还有真正值得改进的地方。如果有，就改写出一份更好的答案，并说清楚你改动了哪些地方、分别是回应哪个维度的意见。只在确有改进价值的地方动手，不要为改而改；要保持当前答案原有的结构和排版，除非批判明确指出结构或格式本身有问题。

要忠于原始问题：不要加入用户没有要求的内容，也不要丢掉用户要求的内容。

如果当前答案已经足够好，或者任何改动都只会让它变差，那就保持它原样、不做任何修改，并直接把当前答案作为结果。`;

export function refineUser(
    query: string,
    current: string,
    critiques: Critique[]
): string {
    const critiqueBlock = critiques
        .map(
            (c) =>
                `【${c.dimension}｜${c.score}/10】问题：${c.issues.length ? c.issues.join("；") : "（无）"
                } 建议：${c.fixes.length ? c.fixes.join("；") : "（无）"}`
        )
        .join("\n");

    return `原始问题：
"""
${query}
"""

当前答案：
"""
${current}
"""

各维度的批判意见：
${critiqueBlock}`;
}