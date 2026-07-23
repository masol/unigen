import type { SerializedGraph } from "graphology-types";
import { z } from 'zod';

export const SizeEstimate = z.enum(['small', 'medium', 'large', 'unbounded']);
export type SizeEstimateT = z.infer<typeof SizeEstimate>;

export const NodeKind = z.enum([
    'extract', 'classify', 'summarize', 'transform',
    'merge', 'score', 'generate', 'lookup', 'aggregate', 'route',
    'split', 'map', 'reduce', 'validate', 'critique', 'compress',
    'plan',
]);
export type NodeKindT = z.infer<typeof NodeKind>;

/** LLM 在逻辑设计阶段可选的思维操作类型 */
export const LOGICAL_NODE_KINDS: NodeKindT[] = [
    'extract', 'classify', 'summarize', 'transform',
    'merge', 'score', 'generate', 'lookup', 'aggregate', 'route', 'plan',
];

/** 全部合法枚举值（供抽取阶段 describe 归一使用） */
const ALL_KIND_VALUES = NodeKind.options.join(' / ');

// ─── Artifact（LLM 设计阶段的完整定义） ───────────────────────────────────

export const ArtifactSchema = z.object({
    name: z.string().min(1)
        .describe("成果名称,脱离上下文可理解;同一份成果全文只用一个名字"),
    intent: z.string().min(1)
        .describe("这份成果是什么——描述成果本身,不描述怎么做出来的"),
    qualityCriteria: z.array(z.string()).default([])
        .describe("人类同行如何判断这份成果做得好不好"),
    sizeEstimate: SizeEstimate.default('small')
        .describe("预估规模。small(<1K) / medium(1K-10K) / large(10K-600K) / unbounded(>600K)"),
    isArray: z.boolean().default(false)
        .describe("是否为数组形式（多条同构数据,如列表/清单/集合）。false=单一数据,true=多条数据"),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

// ─── Node（LLM 设计阶段的定义，inputs/outputs 为完整 Artifact） ──────────

export const DagNodeSchema = z.object({
    name: z.string().min(1)
        .describe("环节名(动宾结构):人类在这步做什么思维活动"),
    kind: NodeKind
        .describe(
            `思维操作类型。【只能取以下之一，不得发明目录外的值】：${ALL_KIND_VALUES}。` +
            `若某环节的动作与上述某个词不完全吻合，请选择语义最接近的一个：` +
            `规划/搭结构/排大纲/设计骨架→plan；` +
            `重写/改写/转换/风格化/排版→transform；` +
            `撰写/创作/生成新内容→generate；` +
            `挑选/评分/择优→score；提取/抽取→extract；分类/贴标签→classify；` +
            `拼接/组合/合并多份→merge；归纳/综合多条为一→summarize 或 aggregate。` +
            `严禁输出上述清单之外的任何字符串（如 plan 之外的自造词）。`),
    intent: z.string().min(1)
        .describe("人类在这步怎么想:看什么材料、做什么判断/分析/创作、产出什么。" +
            "若出现'然后/接着/再',说明该拆为两步。用陈述句描述,禁止疑问句"),
    inputs: z.array(ArtifactSchema).min(1)
        .describe("这步需要看的材料/成果"),
    outputs: z.array(ArtifactSchema).min(1).max(1)
        .describe("这步产出的成果,恰好一份"),
});

export type DagNode = z.infer<typeof DagNodeSchema>;

export const NodeListSchema = z.object({
    artifacts: z.array(ArtifactSchema).min(1)
        .describe("本层全部成果清单(初始材料/中间成果/最终交付)"),
    nodes: z.array(DagNodeSchema).min(1)
        .describe("思维环节清单。每个环节产出清单中的一份成果"),
});

export type NodeList = z.infer<typeof NodeListSchema>;

export type Io = Pick<Artifact, 'name' | 'intent'>;

export type DagDesignResult = NodeList & { text: string; };

// ── facets ─────────────────────────────────────────────────────────────────

export type TriState = 'pending' | 'yes' | 'no';

export type NodeStatus =
    'pending' | 'expanding' | 'expanded'
    | 'awaiting_code' | 'done' | 'conflict';

export type RiskLevel = 'low' | 'medium' | 'high';
export type GuardKind = 'validate' | 'critique';

/**
 * 代码级运行时节点
 * inputs/outputs 只存名称引用，完整信息通过 GDag.getArtifact(name) 查询
 */
export interface PNode {
    id: string;
    name: string;
    kind: NodeKindT;
    intent: string;
    /** 输入 artifact 名称列表（通过注册表查询完整信息） */
    inputs: string[];
    /** 输出 artifact 名称列表（通过注册表查询完整信息），恰好 1 个 */
    outputs: string[];
    status: NodeStatus;
    dag: string | null;
    error: string | null;
    facets: Facets;
    forcedNote?: string;
    risk?: RiskLevel;
    synthetic?: boolean;
    guard?: boolean;
    guardKinds?: GuardKind[];
    sequential?: boolean;
}

export type Facets = Record<string, TriState>;

export interface RegArtifact {
    name: string;
    intent: string;
    aliases: string[];
    qualityCriteria: string[];
    sizeEstimate: SizeEstimateT;
    isArray: boolean;
    dataSchema: unknown | null;
}

export interface GDagJSON {
    rootId: string | null;
    graphs: { id: string; data: SerializedGraph }[];
    artifacts: RegArtifact[];
}