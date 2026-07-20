import type { SerializedGraph } from "graphology-types";
import { z } from 'zod';

export const IoSchema = z.object({
    name: z.string().min(1)
        .describe("数据产物名称，照抄蓝图【数据产物清单】中的名称，一字不改；同一份数据全文只有一个名称"),
    intent: z.string().min(1)
        .describe("照抄蓝图【数据产物清单】中该名称后的说明文字：这份数据是什么、为何存在"),
});

export const DagNodeSchema = z.object({
    name: z.string().min(1)
        .describe("节点名称，照抄蓝图【加工节点清单】中的节点名(动宾结构)，一字不改"),
    intent: z.string().min(1)
        .describe("照抄蓝图中该节点的说明：把哪些输入变成哪些输出、为什么。只含做什么，不含怎么做"),
    inputs: z.array(IoSchema).min(1)
        .describe("该节点消费的数据产物。从蓝图中该节点说明里识别其输入，逐个到【数据产物清单】对齐名称与说明"),
    outputs: z.array(IoSchema).min(1)
        .describe("该节点产出的数据产物。从蓝图中该节点说明里识别其输出，逐个到【数据产物清单】对齐名称与说明"),
});

export const NodeListSchema = z.object({
    nodes: z.array(DagNodeSchema).min(1)
        .describe("蓝图【加工节点清单】的逐条搬运，不增删、不改写、不合并"),
});


export type DagNode = z.infer<typeof DagNodeSchema>;
export type NodeList = z.infer<typeof NodeListSchema>;

export type Io = z.infer<typeof IoSchema>;

export type DagDesignResult = NodeList & {
    /** 自然语言蓝图原文：结构化信息的信源 + 后续细化的上下文锚点(假设/范围外都在其中) */
    text: string;
};

// ── facets：并行判定维度(三态) ───────────────────────────────────────────

export type TriState = 'pending' | 'yes' | 'no';
export type Facets = Record<string, TriState>;


/**
 * 节点生命周期(对齐 capability 的演进路径)：
 *  pending       刚登记，仅有 name/intent/io，等待处理
 *  expanding     处理中(正在为其设计子 DAG 或细化数据结构)
 *  expanded      已展开，dag 指向子图；自身退化为归约视图
 *  awaiting_code 设计完毕，等待生成可执行载体(code/workflow/提示词)
 *  done          已落为 capability
 *  conflict      被校验/评审判定矛盾，等待重生成
 */
export type NodeStatus =
    'pending' | 'expanding' | 'expanded'
    | 'awaiting_code' | 'done' | 'conflict';

/** 代码级运行时节点：从 DagNode 派生，LLM 不产出、不可见 */
export interface PNode extends DagNode {
    id: string;
    status: NodeStatus;
    /** 子图 id；null = 未展开(叶子)。展开 = 把本节点当作交付目标设计子 DAG */
    dag: string | null;
    /** conflict 时的矛盾描述，回喂重生成用 */
    error: string | null;
    /** 并行判定维度。禁止经 updateNode 整体打补丁(浅合并会整包覆盖)，用 setFacet */
    facets: Facets;
    /**
     * 强制裁决留痕(与 error 的 conflict 语义分离)：非空 = 该节点是被
     * 深度熔断等机制"强制"落叶的，判定结果不可信，转代码时必须特殊对待。
     */
    forcedNote?: string;
}

export interface RegArtifact {
    name: string;           // 归一后的正式名
    intent: string;
    aliases: string[];      // 归一吸收的别名，留痕供审计
    dataSchema: unknown | null; // 后续 pass 的细化槽位，第一遍恒为 null
}

export interface GDagJSON {
    rootId: string | null;
    graphs: { id: string; data: SerializedGraph }[];
    artifacts: RegArtifact[];
}
