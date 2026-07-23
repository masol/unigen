/**
 * 按 node.kind 分派的「代码生成」与「提示词」附加指引。
 *
 * 设计意图：
 *   - plan.ts 推出的 dataFlow 决定「处理拓扑骨架」（是通用的、与业务动词无关）；
 *   - node.kind（extract / summarize / classify / transform / generate / plan ...）
 *     决定「业务语义偏好」（切分粒度、忠实度、结构化提取倾向、风格等）。
 *   本模块把后者从 codeGen / promptGen 里抽出，集中为可注册的表，避免散落硬编码。
 *
 * ── 如何扩展一个新的 kind ──────────────────────────────────────────────
 *   1. 在 KIND_GUIDANCE 中新增一条：
 *        myKind: {
 *          codeHint: "生成代码时的额外提醒（追加进 codeGen 的 instructions）",
 *          promptHint: "撰写提示词时的额外提醒（追加进 promptGen 的 nl）",
 *          qualityFallback: ["质量标准兜底1", "质量标准兜底2"], // 可选
 *        }
 *   2. 无需改动任何调用点：codeGen / promptGen / promptGen.deriveQuality
 *      会自动读取。未注册的 kind 走 DEFAULT_GUIDANCE，行为与旧版一致。
 *
 * 约束：这里只提供「语义偏好提醒」，绝不覆盖 dataFlow 的拓扑判断，也不覆盖
 *       数据存取硬约束（裸值 / toStrSafe / 键名带前导下划线等）。
 */

export interface KindGuidance {
    /** 追加进 codeGen 的 instructions，提醒该 kind 的实现偏好 */
    codeHint: string;
    /** 追加进 promptGen 的 nl，提醒该 kind 的撰写偏好 */
    promptHint: string;
    /** 质量标准兜底（deriveQuality 最末级降级用） */
    qualityFallback: string[];
}

const DEFAULT_GUIDANCE: KindGuidance = {
    codeHint: "",
    promptHint: "",
    qualityFallback: ["产出准确、完整、可直接被下游使用"],
};

/**
 * kind → 指引。键名与 PNode.kind 取值保持一致。
 * 未列出的 kind 自动回退 DEFAULT_GUIDANCE。
 */
export const KIND_GUIDANCE: Record<string, KindGuidance> = {
    extract: {
        codeHint: "extract 类通常一条输入可炸出多条结果：优先按空行切分为 string[] 并 .flat() 汇总，切分为空时回退整段并 ctx.warn。",
        promptHint: "extract：要求逐条列出所有结果，每条独立成段、空行分隔；忠于原文、不遗漏、不臆造。",
        qualityFallback: ["提取完整、不遗漏有效信息", "忠于原文、不臆造内容"],
    },
    summarize: {
        codeHint: "summarize 类产出通常是单一连贯文本：一次 generate，save 字符串，不做多条切分。",
        promptHint: "summarize：要求产出一段连贯、精炼、不失真的文本，抓主干、去冗余。",
        qualityFallback: ["准确、精炼、不失真"],
    },
    classify: {
        codeHint: "classify 类若需程序可判定的类别，可用 llm.safefmt 提取结构化标签；否则让标签以自然语言写进文本开头。",
        promptHint: "classify：类别体系需一致；若携带类别，让类别以自然语言写进文本（如以【正面】开头），而非机器格式。",
        qualityFallback: ["分类准确、类别一致"],
    },
    transform: {
        codeHint: "transform 类通常 N→N 等量映射（map）：逐条处理保留关键信息，收集为等量数组。",
        promptHint: "transform：转换需准确、保留关键信息，不增删语义。",
        qualityFallback: ["转换准确、保留关键信息"],
    },
    generate: {
        codeHint: "generate 类以产出连贯文本为主；若逐章/逐段存在依赖，遵循 sequential 串行并回灌前序上下文。",
        promptHint: "generate：内容切题、结构清晰、可用性高；保持风格一致。",
        qualityFallback: ["内容切题、结构清晰、可用性高"],
    },
    plan: {
        codeHint: "plan 类通常产出结构化清单或大纲：多条时按空行切分为 string[]。",
        promptHint: "plan：结构清晰、覆盖全面、逻辑连贯、层次分明，可直接指导后续产出。",
        qualityFallback: ["结构清晰、覆盖全面", "逻辑连贯、层次分明、可直接指导后续产出"],
    },
};

/** 取某 kind 的指引，未注册回退默认。 */
export function getKindGuidance(kind: string | undefined | null): KindGuidance {
    return (kind && KIND_GUIDANCE[kind]) || DEFAULT_GUIDANCE;
}