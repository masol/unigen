import { z } from "zod";

/* ---------- 公共 ---------- */

export const ModalityEnum = z
    .enum(["text", "concept", "image", "audio", "video", "binary"])
    .describe("交付物模态。text=可直接生成的文本; concept=人类概念/结构化文本; 其余为非文本");

export const ArtifactRefSchema = z.object({
    name: z.string().describe("交付物名，snake_case，简短稳定，如 storyboard_shot_list"),
    modality: ModalityEnum,
    definition: z.string().describe("一句话定义：这个交付物是什么、包含什么。对齐判定的语义锚点，必须写清"),
});

export const MethodDraftSchema = z.object({
    transform: z
        .string()
        .describe("这一步转化做什么，一句话，动词开头，如「根据分镜清单逐条生成文生视频提示词」。将直接成为工作流节点文案"),
    gate: z
        .enum(["A", "B"])
        .describe("A=多模态桥接(输出为非文本,逆推其文本接口依赖) B=概念横向解构(拆分文本/概念的原子构成)"),
    inputs: z
        .array(ArtifactRefSchema)
        .min(1)
        .describe("该转化的全部前置交付物(AND:全部就绪才可执行)。每个都应比输出更接近原始输入"),
});

/* ---------- X1 目标锚定 ---------- */

export const AnchorSchema = z.object({
    is_plannable: z.boolean().describe("目标是否明确、有具体交付物、可拆成多步。开放/模糊/无交付物则 false"),
    reason: z.string().describe("判定理由，简短"),
    final: ArtifactRefSchema.describe("终极交付物"),
    sources: z.array(ArtifactRefSchema).describe("人类提供的原始输入素材，逐一登记"),
});
export type Anchor = z.infer<typeof AnchorSchema>;

/* ---------- X2 单步逆向拆解 ---------- */

export const DecomposeSchema = z.object({
    is_grounded: z
        .boolean()
        .describe("该交付物能否由原始输入素材【直接】提取或推导(无需中间产物)。能则 true 且 methods=[]"),
    grounded_from: z.array(z.string()).describe("is_grounded=true 时，列出所依据的 source 交付物 id；否则 []"),
    methods: z
        .array(MethodDraftSchema)
        .max(3)
        .describe("产出该交付物的 1~3 种候选转化(OR,彼此是不同思路)。is_grounded=true 时为 []"),
});
export type Decompose = z.infer<typeof DecomposeSchema>;

/* ---------- X3 对齐复核 ---------- */

export const AlignSchema = z.object({
    decision: z.enum(["reuse", "new"]).describe("候选交付物是否与某个已有条目是同一实体"),
    matched_id: z.string().nullable().describe("decision=reuse 时给出命中的已有 id；否则 null"),
    confidence: z.number().min(0).max(1).describe("判定置信度"),
    reason: z.string().describe("依据【定义】而非名字给出理由"),
});
export type Align = z.infer<typeof AlignSchema>;

/* ---------- X4 阻塞换路 ---------- */

export const RerouteSchema = z.object({
    give_up: z.boolean().describe("是否放弃：确无其它可行拆法时 true"),
    reason: z.string().describe("放弃原因或新思路说明"),
    new_methods: z
        .array(MethodDraftSchema)
        .max(3)
        .describe("与已失败思路【实质不同】的新候选转化；give_up=true 时为 []"),
});
export type Reroute = z.infer<typeof RerouteSchema>;

/* ---------- S2' 固定棱面批判 / S3 合并精炼 ---------- */

export const StepCritiqueSchema = z.object({
    facet: z.string().describe("对应的棱面名"),
    score: z.number().min(0).max(10).describe("本棱面达成度"),
    issues: z.array(z.string()).describe("本棱面下的具体问题；没有则空数组"),
    fixes: z.array(z.string()).describe("对应问题的可执行修改建议"),
});
export type StepCritique = z.infer<typeof StepCritiqueSchema>;

export const StepRefineSchema = z.object({
    changed: z.boolean().describe("是否做了有价值的修改；false 则上层回退保留原稿"),
    changelog: z.array(z.string()).describe("changed=true 时逐条说明改动及对应棱面"),
    refined: DecomposeSchema.describe("精炼后的拆解结果；未改动则原样返回"),
});
export type StepRefine = z.infer<typeof StepRefineSchema>;