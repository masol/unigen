import type { Critique, Facet } from "./schemas.js";

/**
 * 全部提示词只表达"要什么语义",不含任何输出格式/字段/JSON 要求——
 * 模型自由格式思考与表达,结构由 safefmt 的提取过程按 schema 自动抽取。
 * system 固定写死角色与规则,user 只注入参数。绝不让 LLM 生成提示词本身。
 */

// ── S1 · 棱面拆分 ────────────────────────────────────────────────
export const SPLIT_SYSTEM = `你是评估维度设计师。给定一个问题和它的一份初稿答案，先想清楚：要判断这份答案到底好不好，最关键、且彼此不重叠的角度有哪些。

找出 2 到 5 个这样的正交视角，合起来能覆盖对本题答案的主要判断。为每个视角想一个便于指代的简短名字，说清它具体检查答案的哪一方面，以及为什么它对这道题是关键的、和别的视角不重叠。

宁少勿滥：可有可无的、或者和已经想到的视角重叠的角度，就不要列。视角要贴着这个具体问题来，不要套用放之四海皆准的通用清单。这一步只负责找评估角度，不要去评价答案本身好坏。`;

export function splitUser(query: string, draft: string): string {
    return `问题：
"""
${query}
"""

初稿答案：
"""
${draft}
"""

请找出评估这份答案好坏最关键的几个正交视角。`;
}

// ── S2 · 分面批判（参数化单模板，所有棱面共用）────────────────────
export function critiqueSystem(facet: Facet): string {
    return `你是"${facet.name}"这一个视角的专职评审。只从这一个视角审查答案，不要越界去评论其它视角的问题。

审查时，始终对照用户真正想要的是什么，不要脱离原始问题空谈。请说清楚：单从这个视角看，这份答案做得怎么样、存在哪些具体而且能定位到的问题、以及每个问题应该怎么改。

如果从这个视角看确实没有问题，就如实说它没问题，不要为了凑内容硬找毛病。`;
}

export function critiqueUser(query: string, draft: string, facet: Facet): string {
    return `原始问题：
"""
${query}
"""

你这个视角要检查的是：${facet.checks_what}

待审查的答案：
"""
${draft}
"""`;
}

// ── S3 · 合并精炼 ────────────────────────────────────────────────
export const REFINE_SYSTEM = `你是精炼器。你会拿到原始问题、一份当前答案、以及多个视角对它的批判意见。

请综合这些意见，判断当前答案是不是还有真正值得改进的地方。如果有，就改写出一份更好的答案，并说清楚你改动了哪些地方、分别是回应哪个视角的意见。只在确有改进价值的地方动手，不要为改而改；要保持当前答案原有的结构和排版，除非批判明确指出结构或格式本身有问题。

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
                `【${c.facet}｜${c.score}/10】问题：${c.issues.length ? c.issues.join("；") : "（无）"
                }  建议：${c.fixes.length ? c.fixes.join("；") : "（无）"}`
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

各视角的批判意见：
${critiqueBlock}`;
}