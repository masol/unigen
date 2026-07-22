/**
 * 节点计划：产出 NodePlan（共享蓝图），同时驱动 promptGen 与 codeGen。
 *
 * 混合产出：
 *   - 规则部分（确定性）：由各输入/输出交付物 isArray 组合推出骨架。
 *   - 语义部分（一次轻量 LLM 调用，读 node.intent + kind 弱提示）：
 *     判定 mechanical / fan-out（map vs flatmap）/ 聚合方式 / 逐条步是否需 LLM。
 *   - 上下文部分：注入全局目标（pctx.user）与上下游邻接语义。
 *
 * 核心事实：所有交付物只有 string 或 string[]。
 * dataFlow 枚举：
 *   - mechanical        ：0 次 llm，纯代码
 *   - direct            ：标量→标量，1 次 llm.generate
 *   - expand            ：标量→数组，1 次 generate + safefmt(z.array(z.string()))
 *   - map               ：数组→数组，逐条处理，N→N 等量
 *   - flatmap           ：数组→数组，逐条 fan-out（每条炸出多条）再扁平化
 *   - reduce_concat     ：数组→标量，逐条后纯代码 join（聚合无 llm）
 *   - reduce_synthesize ：数组→标量，逐条后一次 generate 跨条归纳
 */

import { safefmt } from "$libs/model/llm/outline.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { PNode } from "$types/index.js";
import { Output } from "ai";
import Logger from "electron-log/main.js";
import { z } from "zod";
import { PlanContext } from "../../context.js";

export type DataFlow =
    | "mechanical"
    | "direct"
    | "expand"
    | "map"
    | "flatmap"
    | "reduce_concat"
    | "reduce_synthesize";

export type Shape = "scalar" | "array";

export interface LLMStep {
    index: number;
    label: string;
    needsSafefmt: boolean;
}

export interface NeighborNode {
    name: string;
    intent: string;
}

export interface NeighborContext {
    upstream: Array<{ artifact: string; producers: NeighborNode[] }>;
    downstream: Array<{ artifact: string; consumers: NeighborNode[] }>;
}

export interface NodePlan {
    dataFlow: DataFlow;
    inputShape: Shape;
    outputShape: Shape;
    sequential: boolean;
    perItemNeedsLLM: boolean;
    llmSteps: LLMStep[];
    summary: string;
    /** 全局目标：用户最原始诉求，对齐终极目的 */
    globalGoal: string;
    /** 上下游语义：帮助定输出粒度、理解数据契约 */
    neighbors: NeighborContext;
}

interface ArtifactShape {
    name: string;
    isArray: boolean;
    intent: string;
    qualityCriteria: string[];
    sizeEstimate: string;
}

function getShape(node: PNode, pctx: PlanContext): {
    inputs: ArtifactShape[];
    outputs: ArtifactShape[];
} {
    const shape = (names: string[]): ArtifactShape[] =>
        names.map(n => {
            const a = pctx.gdag.getArtifact(n);
            return {
                name: n,
                isArray: a?.isArray ?? false,
                intent: a?.intent ?? n,
                qualityCriteria: a?.qualityCriteria ?? [],
                sizeEstimate: a?.sizeEstimate ?? "small",
            };
        });
    return { inputs: shape(node.inputs), outputs: shape(node.outputs) };
}

function collectNeighbors(node: PNode, pctx: PlanContext): NeighborContext {
    const gdag = pctx.gdag;
    const upstream = node.inputs.map(art => ({
        artifact: art,
        producers: gdag.getProducersOf(art)
            .filter(p => p.nodeId !== node.id)
            .map(p => ({ name: p.name, intent: p.intent })),
    }));
    const downstream = node.outputs.map(art => ({
        artifact: art,
        consumers: gdag.getConsumersOf(art)
            .filter(c => c.nodeId !== node.id)
            .map(c => ({ name: c.name, intent: c.intent })),
    }));
    return { upstream, downstream };
}

// ── 语义决策 schema（.describe 只做极简字段标识，防照抄） ──────────────────

const SemanticSchema = z.object({
    mechanical: z.boolean()
        .describe("纯代码可完成、无需语言模型思考"),
    fanOut: z.enum(["one", "many"])
        .describe("处理单条输入产出几条结果：one=恰好一条，many=可能多条"),
    perItemNeedsLLM: z.boolean()
        .describe("多条数据逐条处理时，逐条那步是否需要语言模型"),
    aggregation: z.enum(["concat", "synthesize", "none"])
        .describe("数组→标量的聚合方式；非该场景填 none"),
});

const SEMANTIC_INSTRUCTIONS = `你判定一个数据处理任务的执行策略。只输出结构化结果，不解释。

给你一个"操作类型标签"仅作参考——它由上游自动生成、未经审核、可能出错。以任务意图为准，不要盲从标签。

判定项：
1. mechanical：纯代码即可完成、无需语言模型理解语义（如按行拆分、统计计数、格式转换、加序号、排序去重）。含"合并/映射/提取"等机械动词但需要理解内容的任务，不算 mechanical。
2. fanOut：处理"一条输入"会产出几条结果？
   - one：恰好一条（如把一句英文翻成一句中文）。
   - many：可能多条（如从一篇访谈里提取出多条反馈语句、把一段长文切成多个要点）。
   这是关键：提取/抽取/挖掘/切分类任务通常是 many。
3. perItemNeedsLLM：若逐条处理，逐条那步是否需要语言模型（"给每条加序号"→false；"翻译每条"→true）。非多条场景可填 true。
4. aggregation（仅当"多条数据 → 单一结果"时）：
   - concat：各条结果是最终成品的组成部分，首尾相接即成品（各章拼成整本、各段译文拼成全文）→ 纯代码拼接，不调模型。
   - synthesize：产出是对全体的再加工（提炼/综合/去重/重排），必须跨条理解 → 一次模型调用。
   - none：非该场景。
   判据：把各条结果直接首尾相接，是不是就是最终产物？是则 concat，否则 synthesize。`;

async function decideSemantics(
    node: PNode, inArr: boolean, outArr: boolean, ctx: IRunnerContext,
): Promise<z.infer<typeof SemanticSchema>> {
    const nl = [
        SEMANTIC_INSTRUCTIONS,
        "",
        `任务意图：${node.intent}`,
        `操作类型标签（仅参考，可能有误）：${node.kind}`,
        `输入形态：${inArr ? "多条数据（数组）" : "单一数据（标量）"}`,
        `输出形态：${outArr ? "多条数据（数组）" : "单一数据（标量）"}`,
    ].join("\n");

    const fmt = await safefmt(nl, Output.object({ schema: SemanticSchema }), ctx);
    if (fmt.success && fmt.value?.output) {
        return fmt.value.output as z.infer<typeof SemanticSchema>;
    }
    Logger.warn(`[plan]「${node.name}」语义决策 safefmt 失败，采用保守默认`);
    return {
        mechanical: false,
        fanOut: "one",
        perItemNeedsLLM: true,
        aggregation: inArr && !outArr ? "synthesize" : "none",
    };
}

export async function planNode(node: PNode, pctx: PlanContext): Promise<NodePlan> {
    const { inputs, outputs } = getShape(node, pctx);
    const inArr = inputs.some(i => i.isArray);
    const outArr = outputs[0]?.isArray ?? false;
    const sequential = node.sequential === true;

    const sem = await decideSemantics(node, inArr, outArr, pctx.ctx);

    const inputShape: Shape = inArr ? "array" : "scalar";
    const outputShape: Shape = outArr ? "array" : "scalar";

    const globalGoal = pctx.user;
    const neighbors = collectNeighbors(node, pctx);

    const base = { inputShape, outputShape, sequential, globalGoal, neighbors };

    // ── mechanical ────────────────────────────────────────────────────────
    if (sem.mechanical) {
        return {
            ...base,
            dataFlow: "mechanical",
            perItemNeedsLLM: false,
            llmSteps: [],
            summary: `纯代码任务：${node.intent}。无需语言模型，直接编码处理全部数据。`,
        };
    }

    // ── array → scalar：reduce ────────────────────────────────────────────
    if (inArr && !outArr) {
        const isConcat = sem.aggregation === "concat";
        const perItemNeedsLLM = sem.perItemNeedsLLM;
        const llmSteps: LLMStep[] = [];
        if (perItemNeedsLLM) {
            llmSteps.push({ index: llmSteps.length + 1, label: "逐条处理单条数据", needsSafefmt: false });
        }
        if (!isConcat) {
            llmSteps.push({ index: llmSteps.length + 1, label: "跨条归纳综合为单一结果", needsSafefmt: false });
        }
        return {
            ...base,
            dataFlow: isConcat ? "reduce_concat" : "reduce_synthesize",
            perItemNeedsLLM,
            llmSteps,
            summary: isConcat
                ? `逐条处理数组每条数据，再用代码按序拼接为单一结果。`
                : `逐条处理数组每条数据，再综合归纳为单一结果。`,
        };
    }

    // ── array → array：map 或 flatmap ─────────────────────────────────────
    if (inArr && outArr) {
        const perItemNeedsLLM = sem.perItemNeedsLLM;
        const isFlat = sem.fanOut === "many";
        const llmSteps: LLMStep[] = perItemNeedsLLM
            ? [{ index: 1, label: isFlat ? "处理单条数据产出多条结果" : "处理单条数据产出单条结果", needsSafefmt: isFlat }]
            : [];
        return {
            ...base,
            dataFlow: isFlat ? "flatmap" : "map",
            perItemNeedsLLM,
            llmSteps,
            summary: isFlat
                ? `遍历输入数组每一条，每条可产出多条结果，全部扁平化收集为一个数组。`
                : `遍历输入数组每一条，逐条处理产出等量结果，收集为数组。`,
        };
    }

    // ── scalar → array：expand ────────────────────────────────────────────
    if (!inArr && outArr) {
        return {
            ...base,
            dataFlow: "expand",
            perItemNeedsLLM: false,
            llmSteps: [
                { index: 1, label: "从单一输入产出多条结果", needsSafefmt: true },
            ],
            summary: `从单一输入产出多条结果：一次生成自然语言，再提取为字符串数组。`,
        };
    }

    // ── scalar → scalar：direct ───────────────────────────────────────────
    return {
        ...base,
        dataFlow: "direct",
        perItemNeedsLLM: false,
        llmSteps: [
            { index: 1, label: "处理输入产出结果", needsSafefmt: false },
        ],
        summary: `读入单一数据，处理后产出单一结果。`,
    };
}