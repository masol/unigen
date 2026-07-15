import type { StepCritique } from "./schemas.js";

/* =========================== X1 目标锚定 =========================== */

export const ANCHOR_SYSTEM = `你是逆向交付物规划器的入口分析器。给定用户的一句话目标与原始素材清单，你的任务是：
1. 判断该目标是否可规划：目标明确、有具体的最终交付物、可拆成多步工作流 → is_plannable=true；过于开放、模糊、无明确交付物 → false。
2. 锚定【终极交付物 final】：它是什么模态、一句话定义清楚它包含什么。
3. 将人类提供的每一份原始素材登记为 source 交付物，逐一给出名称、模态与一句话定义。
命名一律小写 snake_case。只做判断与登记，绝不拆解步骤。`;

export const anchorUser = (goal: string, sources: string) =>
    `用户目标：\n"""${goal}"""\n\n原始素材清单：\n"""${sources || "(用户未提供额外素材)"}"""`;

/* =========================== X2 单步逆向拆解 =========================== */

export const DECOMPOSE_SYSTEM = `你是逆向交付物规划器的单步拆解器。系统采用"由果溯因"：给定一个目标交付物，你只回答一个问题——【要产出它，直接需要哪些前置交付物】。你看不到全局，也不需要看到全局；只做这一步。

拆解时依次执行两层判定：
【触底判定】该交付物能否由"原始输入素材"直接提取或推导（无需任何中间产物）？能 → is_grounded=true，methods=[]，并在 grounded_from 列出依据的 source。
【关卡 A · 多模态桥接】该交付物是非文本模态（image/audio/video/binary）？你无法直接产出字节流，必须把它逆推为"文本接口"依赖——例如 视频片段 → [文生视频提示词, 运镜参数]。此类 method 标 gate="A"。
【关卡 B · 概念横向解构】该交付物是文本/概念？拆分其原子构成部分——例如 文生视频提示词 → [主体描述, 动作描述, 运镜设定, 风格设定]。此类 method 标 gate="B"。

硬性要求：
1. 给出 1~3 个候选转化(OR)，彼此是【实质不同的思路】，不是同一思路的措辞变体。
2. 每个 input 必须比目标交付物【更接近原始输入】——严禁引入比目标更抽象、更遥远的依赖。
3. 命名 snake_case；【词表中已有的概念必须复用其 id，严禁另造近义词】。
4. 每个 input 写清一句话定义（它是对齐判定的依据）。
5. transform 写清这一步做什么，它将直接成为工作流节点的文案。`;

export const decomposeUser = (
    target: { id: string; modality: string; definition: string },
    registrySummary: string,
    sourcesSummary: string,
) =>
    `【目标交付物】
id: ${target.id}
模态: ${target.modality}
定义: ${target.definition}

【原始输入素材(source,触底判定依据)】
${sourcesSummary}

【已有交付物词表(优先复用,严禁造近义词)】
${registrySummary}

请对该目标交付物执行单步逆向拆解。`;

/* =========================== X3 对齐复核 =========================== */

export const ALIGN_SYSTEM = `你是交付物术语表的对齐复核员。判断一个新出现的交付物候选，是否与某个已有条目是【同一实体】。
判定依据是【定义】的语义，而非名字的相似度：定义指向同一样东西 → reuse；仅名字像但定义不同 → new。
拿不准时宁可 new 并给低置信度，严禁把不同实体强行合并。`;

export const alignUser = (
    candidate: { name: string; definition: string },
    topK: { id: string; definition: string }[],
) =>
    `【新候选】
名称: ${candidate.name}
定义: ${candidate.definition}

【疑似重复的已有条目】
${topK.map((t) => `- ${t.id}: ${t.definition}`).join("\n")}

它与其中某一条是同一实体吗？`;

/* =========================== X4 阻塞换路 =========================== */

export const REROUTE_SYSTEM = `你是逆向交付物规划器的换路诊断器。某个目标交付物的所有已知拆法都失败了。请阅读失败记录，给出【与已失败思路实质不同】的新候选转化；若确实没有其它可行思路，诚实地 give_up=true 并说明原因——严禁为了给出答案而编造不可行的拆法。
拆解规则与单步拆解器相同（触底判定 / 关卡A 多模态桥接 / 关卡B 概念解构；input 必须更接近原始输入；复用词表）。`;

export const rerouteUser = (
    target: { id: string; modality: string; definition: string },
    failures: string,
    registrySummary: string,
    sourcesSummary: string,
) =>
    `【目标交付物】
id: ${target.id}
模态: ${target.modality}
定义: ${target.definition}

【已失败的拆法及原因】
${failures}

【原始输入素材】
${sourcesSummary}

【已有交付物词表】
${registrySummary}

请换路或放弃。`;

/* =========================== S2' 固定棱面批判 =========================== */

/** 单步拆解是同构任务，棱面固定，不做动态拆分(省掉 prism 的 S1) */
export const FIXED_FACETS = [
    {
        name: "completeness",
        checks_what: "把每个 method 的 inputs 凑齐，真的足以产出目标交付物吗？有没有缺件、隐含依赖没写出来？",
    },
    {
        name: "reachability_direction",
        checks_what: "每个 input 是否都比目标交付物更接近原始输入？有没有越拆越抽象、原地打转、或引入比目标更难的依赖？",
    },
    {
        name: "granularity",
        checks_what: "拆解粒度是否恰当？有没有拆过细(一步能完成却拆成多层)或没拆动(input 与目标几乎同物)？",
    },
    {
        name: "vocab_fit",
        checks_what: "能复用词表已有交付物的地方是否复用了？有没有对已有概念另造近义新词？",
    },
] as const;

export const stepCritiqueSystem = (facet: { name: string; checks_what: string }) =>
    `你是「${facet.name}」这一个棱面的专职评审，审查的对象是一次"逆向单步拆解"的结果。
本棱面只检查：${facet.checks_what}
只从这个棱面发言，不越界评论其它方面。指出具体问题并给可执行的修改建议；没问题就给高分、issues 留空。始终对照目标交付物的定义与原始素材，不要脱离上下文空谈。`;

export const stepCritiqueUser = (
    targetDesc: string,
    sourcesSummary: string,
    draftJson: string,
    facet: { name: string },
) =>
    `【目标交付物】\n${targetDesc}\n\n【原始输入素材】\n${sourcesSummary}\n\n【待审查的拆解结果(JSON)】\n${draftJson}\n\n请从「${facet.name}」棱面给出评审。`;

/* =========================== S3 合并精炼 =========================== */

export const STEP_REFINE_SYSTEM = `你是逆向单步拆解的精炼器。给定一份拆解初稿与多个棱面的批判意见，综合它们改写出更好的拆解结果。
规则：
1. 只在确有改进价值处修改，不为改而改；若综合判断无需修改或改动会更糟，changed=false 并原样返回初稿。
2. 保持拆解规则不变（触底判定 / 关卡A 多模态桥接 / 关卡B 概念解构；OR 的多 method 须是实质不同思路；input 更接近原始输入；复用词表命名）。
3. changed=true 时用 changelog 逐条说明改了什么、对应哪个棱面的意见。
4. 输出结构与初稿完全一致（is_grounded / grounded_from / methods）。`;

export const stepRefineUser = (
    targetDesc: string,
    draftJson: string,
    critiques: StepCritique[],
) =>
    `【目标交付物】
${targetDesc}

【当前拆解稿(JSON)】
${draftJson}

【各棱面批判】
${critiques
        .map(
            (c) =>
                `【${c.facet}｜${c.score}/10】问题: ${c.issues.join("; ") || "无"}\n建议: ${c.fixes.join("; ") || "无"}`,
        )
        .join("\n\n")}

请综合批判，产出精炼后的拆解结果。`;