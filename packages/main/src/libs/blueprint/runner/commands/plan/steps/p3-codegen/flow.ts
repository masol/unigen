/**
 * 流程规划：纯规则判断，不调 LLM。
 * 基于 inputs/outputs 的 isArray 组合，决定节点内部的处理流程形态。
 *
 * 核心事实：本系统所有交付物都是 string 或 string[]。
 * 因此节点流程可枚举为 4 种形态：
 *   - SCALAR_TO_SCALAR：1 次 llm.generate
 *   - SCALAR_TO_ARRAY：1 次 llm.generate（产出多条候选，safefmt 提取为 array）
 *   - ARRAY_TO_ARRAY：map 语义，外层已并行；节点内仍 1 次 llm.generate
 *   - ARRAY_TO_SCALAR：reduce 语义，可能多次 llm.generate（聚合）
 *   - MECHANICAL：0 次 llm 调用（纯代码/格式转换/统计/模板填充）
 */

import type { PNode } from "$types/index.js";
import { PlanContext } from "../../context.js";

export type FlowKind =
    | "MECHANICAL"
    | "SCALAR_TO_SCALAR"
    | "SCALAR_TO_ARRAY"
    | "ARRAY_TO_ARRAY"
    | "ARRAY_TO_SCALAR";

export interface FlowStep {
    /** 步骤在节点内的顺序，从 1 开始 */
    index: number;
    /** 步骤名（短句，喂给 promptGen / codeGen 用） */
    label: string;
    /** 是否需要 llm.generate */
    needsLLM: boolean;
    /** 是否需要 safefmt（仅当 LLM 产出需要提取为结构化时） */
    needsSafefmt: boolean;
}

export interface FlowSpec {
    kind: FlowKind;
    steps: FlowStep[];
    /** 人类可读的一句话流程描述，注入到 promptGen / codeGen 的上下文 */
    summary: string;
}

interface ArtifactShape {
    name: string;
    isArray: boolean;
}

function getShape(node: PNode, pctx: PlanContext): {
    inputs: ArtifactShape[];
    outputs: ArtifactShape[];
} {
    const shape = (names: string[]): ArtifactShape[] =>
        names.map(n => {
            const a = pctx.gdag.getArtifact(n);
            return { name: n, isArray: a?.isArray ?? false };
        });
    return { inputs: shape(node.inputs), outputs: shape(node.outputs) };
}

function isMechanicalIntent(intent: string): boolean {
    // 纯机械操作的关键词——这些不需要 LLM 思考
    const keywords = [
        "拆分", "切分", "分割", "合并", "拼接", "格式化", "转换格式",
        "统计", "计数", "排序", "去重", "过滤", "映射", "模板填充",
        "重命名", "序列化", "反序列化", "编码", "解码", "校验",
        "extract", "split", "merge", "join", "format", "convert",
        "count", "sort", "dedupe", "filter", "map", "encode", "decode",
    ];
    const lower = intent.toLowerCase();
    return keywords.some(k => lower.includes(k));
}

export function planFlow(node: PNode, pctx: PlanContext): FlowSpec {
    const { inputs, outputs } = getShape(node, pctx);
    const inArr = inputs.some(i => i.isArray);
    const outArr = outputs[0]?.isArray ?? false;

    if (isMechanicalIntent(node.intent)) {
        return {
            kind: "MECHANICAL",
            steps: [],
            summary: `纯机械操作：${node.intent}。不调 LLM，直接写代码。`,
        };
    }

    if (inArr && !outArr) {
        // array → scalar：reduce
        return {
            kind: "ARRAY_TO_SCALAR",
            steps: [
                { index: 1, label: "逐条调用 LLM 处理", needsLLM: true, needsSafefmt: false },
                { index: 2, label: "聚合为单一结果", needsLLM: false, needsSafefmt: false },
            ],
            summary: `reduce 流程：消费数组，对每条数据调一次 LLM，再聚合成单一 string。`,
        };
    }

    if (inArr && outArr) {
        // array → array：map（外层并行）
        return {
            kind: "ARRAY_TO_ARRAY",
            steps: [
                { index: 1, label: "对单条数据调用 LLM", needsLLM: true, needsSafefmt: false },
            ],
            summary: `map 流程：外层已对数组每条数据并行调用本节点；节点内仅处理单条 → 单条。`,
        };
    }

    if (!inArr && outArr) {
        // scalar → array
        return {
            kind: "SCALAR_TO_ARRAY",
            steps: [
                { index: 1, label: "调用 LLM 生成多条候选", needsLLM: true, needsSafefmt: true },
            ],
            summary: `从单一输入生成数组：调一次 LLM 产出多条候选字符串，safefmt 提取为 array。`,
        };
    }

    // !inArr && !outArr
    return {
        kind: "SCALAR_TO_SCALAR",
        steps: [
            { index: 1, label: "调用 LLM 处理", needsLLM: true, needsSafefmt: false },
        ],
        summary: `标量到标量：读入 string，调一次 LLM，产出 string。`,
    };
}