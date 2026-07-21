import type { SerializedGraph } from "graphology-types";
import { z } from 'zod';

export const SizeEstimate = z.enum(['small', 'medium', 'large', 'unbounded']);
export type SizeEstimateT = z.infer<typeof SizeEstimate>;

export const NodeKind = z.enum([
    'extract', 'classify', 'summarize', 'transform',
    'merge', 'score', 'generate', 'lookup', 'aggregate', 'route',
    // P1 内层由 LLM 主动设计的物理节点：
    'split', 'map', 'reduce', 'validate', 'critique', 'compress',
]);
export type NodeKindT = z.infer<typeof NodeKind>;

/** LLM 在逻辑设计阶段可选的思维操作类型 */
export const LOGICAL_NODE_KINDS: NodeKindT[] = [
    'extract', 'classify', 'summarize', 'transform',
    'merge', 'score', 'generate', 'lookup', 'aggregate', 'route',
];

// ─── Artifact ─────────────────────────────────────────────────────────────

export const ArtifactSchema = z.object({
    name: z.string().min(1)
        .describe("成果名称,脱离上下文可理解;同一份成果全文只用一个名字"),
    intent: z.string().min(1)
        .describe("这份成果是什么——描述成果本身,不描述怎么做出来的"),
    qualityCriteria: z.array(z.string()).default([])
        .describe("人类同行如何判断这份成果做得好不好"),
    sizeEstimate: SizeEstimate.default('small')
        .describe("预估规模。small(<1K) / medium(1K-10K) / large(10K-600K) / unbounded(>600K)"),
});

export type Artifact = z.infer<typeof ArtifactSchema>;

// ─── Node ─────────────────────────────────────────────────────────────────

export const DagNodeSchema = z.object({
    name: z.string().min(1)
        .describe("环节名(动宾结构):人类在这步做什么思维活动"),
    kind: NodeKind
        .describe("从思维操作目录选一种,不要发明目录外类型"),
    intent: z.string().min(1)
        .describe("人类在这步怎么想:看什么材料、做什么判断/分析/创作、产出什么。" +
            "若出现'然后/接着/再',说明该拆为两步"),
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

/** 代码级运行时节点 */
export interface PNode extends DagNode {
    id: string;
    status: NodeStatus;
    dag: string | null;
    error: string | null;
    facets: Facets;
    forcedNote?: string;
    risk?: RiskLevel;
    /** 是否为合成节点（chunk/reduce/validate 等机器插入或 LLM 设计但无需人工展开的） */
    synthetic?: boolean;
    guard?: boolean;
    guardKinds?: GuardKind[];
}

export type Facets = Record<string, TriState>;

export interface RegArtifact {
    name: string;
    intent: string;
    aliases: string[];
    qualityCriteria: string[];
    sizeEstimate: SizeEstimateT;
    dataSchema: unknown | null;
}

export interface GDagJSON {
    rootId: string | null;
    graphs: { id: string; data: SerializedGraph }[];
    artifacts: RegArtifact[];
}