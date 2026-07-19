/**
 * ============================================================================
 * 【P-schema · 节点清单(LLM 唯一产出物 / safefmt 直接抽取)】
 * ============================================================================
 * 铁律：
 *  - 本 schema 由 safefmt 直接对"蓝图自然语言原文"做抽取：模型原生 JSON
 *    输出优先，无则退化为 schema 提示词抽取。因此 description 是抽取的
 *    全部引导——每个字段的 description 必须写清"从原文哪里取、怎么取"。
 *  - LLM 只产出节点数组。没有图包装、没有编号——图由代码按 inputs/outputs
 *    名称匹配自动连边；交付物 = 唯一终端产物；初始数据 = 无产出者的输入。
 *  - 名称即身份，全文唯一。运行时属性(id/status/dag)是代码级派生(PNode)，
 *    不在此出现。
 */
import { z } from "zod";

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

export type Io = z.infer<typeof IoSchema>;
export type DagNode = z.infer<typeof DagNodeSchema>;
export type NodeList = z.infer<typeof NodeListSchema>;

export type DagDesignResult = NodeList & {
    /** 自然语言蓝图原文：结构化信息的信源 + 后续细化的上下文锚点(假设/范围外都在其中) */
    text: string;
};