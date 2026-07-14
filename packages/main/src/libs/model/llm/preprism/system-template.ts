import type { Analysis } from "./schemas.js";

/**
 * 把结构化的领域情报组装成回答用的 system prompt。
 *
 * 工程约定（为什么不让 LLM 直接写 system prompt）：
 * - LLM 只产出"事实"（领域、维度、术语、标准、坑），提示词的"骨架"由这里的
 *   固定模板决定——骨架永远一致，所以对任意问题都成立；
 * - 空字段自动跳过整节，不会出现"相关术语：（无）"这种残缺段落；
 * - 末尾守则是代码写死的不变量，分析结果无法覆盖或稀释它；
 * - 所有注入内容做长度与条数截断，防止分析步偶发超长输出把 system 撑爆。
 */

const MAX_ITEMS_PER_LIST = 8;
const MAX_ITEM_LEN = 300;

function clampList(items: string[], max = MAX_ITEMS_PER_LIST): string[] {
    return items
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.length > MAX_ITEM_LEN ? s.slice(0, MAX_ITEM_LEN) + "…" : s))
        .slice(0, max);
}

export function buildAnswerSystem(analysis: Analysis): string {
    const sections: string[] = [];

    // 1) 角色与目标
    sections.push(
        `你是${analysis.domain}领域的资深专家，正在完成一个${analysis.task_type}任务。` +
        `\n用户的真实目标：${analysis.real_goal}。你的回答要直接服务于这个目标。`
    );

    // 2) 必须兼顾的维度及各自标准
    const dimLines = analysis.dimensions.map((d) => {
        const practices = clampList(d.best_practices);
        const body = practices.length ? `：${practices.join("；")}` : "";
        return `- ${d.name}（${d.matters_because}）${body}`;
    });
    if (dimLines.length) {
        sections.push(`回答必须同时兼顾以下维度，并达到每个维度下的标准：\n${dimLines.join("\n")}`);
    }

    // 3) 专业术语（汇总各维度，去重）
    const termSet = new Set<string>();
    for (const d of analysis.dimensions) {
        for (const t of clampList(d.terminology)) termSet.add(t);
    }
    if (termSet.size) {
        sections.push(
            `以下是本题相关的专业术语与最佳方法，请在准确理解的前提下自然使用它们（用对比用多重要）：\n` +
            [...termSet].map((t) => `- ${t}`).join("\n")
        );
    }

    // 4) 常见的坑
    const pitfalls = clampList(analysis.pitfalls);
    if (pitfalls.length) {
        sections.push(`回答这类问题常见的错误，务必避免：\n${pitfalls.map((p) => `- ${p}`).join("\n")}`);
    }

    // 5) 好回答的样子
    if (analysis.ideal_answer_shape.trim()) {
        sections.push(`一份好的回答应当：${analysis.ideal_answer_shape.trim()}`);
    }

    // 6) 固定守则（代码写死的不变量，任何分析结果不可覆盖）
    sections.push(
        `通用守则：忠于用户的问题本身，用户没要求的不要加，用户要求的不要漏；` +
        `不确定的事实不要编造，如实说明不确定；` +
        `术语服务于表达，不要为了显得专业而堆砌；` +
        `用与用户提问相同的语言作答。`
    );

    return sections.join("\n\n");
}