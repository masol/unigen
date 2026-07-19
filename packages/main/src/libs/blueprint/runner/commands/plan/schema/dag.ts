/**
 * ============================================================================
 * 【P-schema · IntentDag 提取结构】
 * ============================================================================
 * 设计原则：
 *  - 极简。只承载"图能成立"所需的最少信息：节点(name+intent+inputs+outputs)、
 *    数据产物(name+intent+origin)、目标交付物。
 *  - name/intent 允许自创词汇，但必须脱离上下文可理解——这是全局归一(Fuse+LLM)
 *    的前提。
 *  - 不在此处表达递归。递归发生在全局层(GDag.subDagId)：任意节点未来都可以
 *    被同一套流程展开为子 DAG，子 DAG 提取时复用本 schema。
 *  - 数据结构细化(JSON Schema + description)不在第一遍做，ArtifactRecord 上
 *    预留 dataSchema 槽位，由后续 pass 正向扫描时逐步填充/拆分(Map-Reduce)。
 */
import { z } from "zod";

export const NodeId = z.string().regex(/^N-\d{2}$/);

export const ArtifactSchema = z.object({
    name: z.string().min(1)
        .describe("数据产物名称，全文唯一；可自创词汇，但脱离上下文必须可理解"),
    intent: z.string().min(1)
        .describe("这份数据是什么、为何存在——一句话，脱离上下文可理解"),
    origin: z.enum(["given", "produced"])
        .describe("given=任务启动时一次性提供的初始数据；produced=由某个节点产出"),
});

export const DagNodeSchema = z.object({
    id: NodeId,
    name: z.string().min(1)
        .describe("节点名称，动宾结构，全文唯一；可自创词汇，但脱离上下文必须可理解"),
    intent: z.string().min(1)
        .describe("该节点意图：把什么变成什么、为什么——一句话，不写怎么做(不提模型/工具/存储)"),
    inputs: z.array(z.string().min(1)).min(1)
        .describe("消费的数据产物 name 列表；只能引用 artifacts 中已声明的名称，不得重复"),
    outputs: z.array(z.string().min(1)).min(1)
        .describe("产出的数据产物 name 列表；只能引用 artifacts 中 origin=produced 的名称"),
});

export const IntentDagSchema = z.object({
    goal: z.object({
        name: z.string().min(1).describe("最终交付物的名称"),
        intent: z.string().min(1).describe("一句话定义最终交付物是什么、给谁、用来做什么"),
        deliverableName: z.string().min(1)
            .describe("最终交付物对应的数据产物 name，必须在 artifacts 中且 origin=produced"),
    }),
    artifacts: z.array(ArtifactSchema).min(1)
        .describe("全图涉及的所有数据产物：初始输入(given) + 中间/最终产物(produced)，name 全文唯一"),
    nodes: z.array(DagNodeSchema).min(1)
        .describe("处理节点。节点间不直接连边，通过共享数据产物 name 隐式成图"),
    assumptions: z.array(
        z.object({
            id: z.string().regex(/^A-\d{2}$/),
            content: z.string().min(1),
            basis: z.enum(["用户明示", "领域惯例", "推断"]),
        }),
    ).describe("每个非用户明示的决定必须登记为编号假设"),
    outOfScope: z.array(z.object({ item: z.string(), reason: z.string() }))
        .describe("从目标中拆除的不可自动化部分及原因"),
});

export type Artifact = z.infer<typeof ArtifactSchema>;
export type DagNode = z.infer<typeof DagNodeSchema>;
export type IntentDag = z.infer<typeof IntentDagSchema>;

export type IntentDagWithText = IntentDag & {
    /** 自然语言蓝图原文缓冲：结构化提取的信源，后续 pass 细化时的上下文锚点 */
    text: string;
};