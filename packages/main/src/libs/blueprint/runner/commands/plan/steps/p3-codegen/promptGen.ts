/**
 * 提示词生成器：消费共享蓝图 NodePlan，为每个 llmStep 产出一对 PromptPair。
 *
 * 采用工程最佳提示词结构（角色 / 上下文 / 任务 / 输入契约 / 输出契约 / 约束 / 边界）。
 * 面向「数据处理任务本身」——严禁"节点/DAG/环节/思维流程"等系统内部词汇。
 * schema 的 .describe() 只做极简字段标识，防止模型照抄字段说明当内容。
 *
 * 关键：输出契约必须匹配交付物形态，且为纯自然语言。
 *   - 多条产出以"每条独立成段、空行分隔"约定，此约定即代码切分依据，二者必须一致。
 *   - 默认严禁要求 JSON / 键值对 / 复杂机器格式。
 */

import { safefmt } from "$libs/model/llm/outline.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { PNode } from "$types/index.js";
import { Output } from "ai";
import Logger from "electron-log/main.js";
import { z } from "zod";
import { PlanContext, PromptPair } from "../../context.js";
import type { NodePlan } from "./plan.js";

const PromptPairSchema = z.object({
    system: z.string().describe("角色、背景、质量标准"),
    user: z.string().describe("任务指令、输入契约、输出契约、边界约定"),
});

const PromptListSchema = z.object({
    prompts: z.array(PromptPairSchema).describe("按处理阶段顺序的提示词对"),
});

const PROMPT_GEN_INSTRUCTIONS = `你为一个数据处理任务撰写高质量提示词（system + user 对）。目标读者是一个语言模型执行者。

严格约束：
- 面向「数据处理任务本身」。严禁出现"节点""DAG""环节""思维流程""步骤编号"等系统内部词汇，也不要提及代码/API/库/函数名。
- 提示词要"充分展开"，不要一两句敷衍。用工程最佳结构组织。
- **输出一律为纯自然语言**。默认严禁要求执行者输出 JSON / 键值对 / 表格等机器格式。若某条产出需要携带标签或属性，让标签以自然语言写进文本本身（例如"以【正面】开头"），而非结构化字段。

【system 应包含】
1. 角色定位：明确执行者的专业身份与视角。
2. 全局背景：一句话点出这项工作最终服务于什么目标（用于对齐判断标准）。
3. 质量标准：把给定的质量要求内化为可执行的行为准则（准确性、完整性、粒度、风格等）。

【user 应包含】
1. 任务陈述：清晰说明要做什么（由意图精炼而来，不复述原文）。
2. 输入契约：输入数据的形态（单一文本 / 多条中的一条）、含义、来源背景（它是上游哪种加工的产物）。
3. 输出契约：输出的形态、粒度、数量预期。下游要拿它做什么，据此定粒度。
4. 边界约定：至少一条异常/空值处理约定（如"若无有效内容，输出空"）。

【输出契约按形态适配（务必与实际形态一致）】
- 产出单一结果（标量）：要求"产出一段连贯完整的文本"。
- 产出多条结果（数组 / 提取 / 切分）：要求"逐条列出，**每条独立成段、以空行分隔**，每条自足可理解，不遗漏、不臆造"。这个空行分隔格式是下游程序切分的唯一依据，必须明确写出。

【形态适配（补充）】
- 逐条处理集合中的一条数据：user 说明"你当前处理的是其中一条数据"。
- 一条输入产出多条结果（提取/切分）：user 说明"请以自然语言列出所有结果，每条独立成段、空行分隔，不要遗漏、不要臆造"。
- 跨多条结果归纳综合：user 说明"你会收到多条已处理结果，请综合"。
- 顺序依赖：user 说明"你会同时收到已处理的前序结果作为上下文，请保持连贯"。

输出：严格按需要的阶段数量输出提示词对（1 阶段 1 对，2 阶段 2 对）。`;

/** qualityCriteria 缺失时的降级：下游 intent 反推 → kind 通用模板 */
function deriveQuality(
    node: PNode, artName: string, pctx: PlanContext,
): string[] {
    const a = pctx.gdag.getArtifact(artName);
    if (a?.qualityCriteria && a.qualityCriteria.length > 0) return a.qualityCriteria;

    // 降级 1：用下游 intent 反推
    const consumers = pctx.gdag.getConsumersOf(artName).filter(c => c.nodeId !== node.id);
    if (consumers.length > 0) {
        return consumers.map(c => `需满足下游「${c.name}」的使用前提：${c.intent}`);
    }

    // 降级 2：kind 通用模板
    const byKind: Record<string, string[]> = {
        extract: ["提取完整、不遗漏有效信息", "忠于原文、不臆造内容"],
        summarize: ["准确、精炼、不失真"],
        classify: ["分类准确、类别一致"],
        transform: ["转换准确、保留关键信息"],
        generate: ["内容切题、结构清晰、可用性高"],
    };
    return byKind[node.kind] ?? ["产出准确、完整、可直接被下游使用"];
}

function artifactDesc(
    node: PNode, names: string[], pctx: PlanContext,
): string {
    return names.map(n => {
        const a = pctx.gdag.getArtifact(n);
        const parts = [
            `- ${n}：${a?.intent ?? n}`,
            `  形态：${a?.isArray ? "多条数据（数组）" : "单一数据"}，规模：${a?.sizeEstimate ?? "small"}`,
        ];
        const quality = deriveQuality(node, n, pctx);
        if (quality.length > 0) {
            parts.push(`  质量标准：${quality.join("；")}`);
        }
        return parts.join("\n");
    }).join("\n");
}

function neighborDesc(node: PNode, pctx: PlanContext): string {
    const up = node.inputs.flatMap(art => {
        const ps = pctx.gdag.getProducersOf(art).filter(p => p.nodeId !== node.id);
        return ps.map(p => `- 输入「${art}」来自上游「${p.name}」：${p.intent}`);
    });
    const down = node.outputs.flatMap(art => {
        const cs = pctx.gdag.getConsumersOf(art).filter(c => c.nodeId !== node.id);
        return cs.map(c => `- 产出「${art}」将被下游「${c.name}」使用：${c.intent}`);
    });
    const lines = [...up, ...down];
    return lines.length ? lines.join("\n") : "（无显式上下游，属边界任务）";
}

export async function genPromptsForNode(
    node: PNode, plan: NodePlan, pctx: PlanContext,
): Promise<PromptPair[]> {
    const ctx: IRunnerContext = pctx.ctx;
    const llmSteps = plan.llmSteps;

    // mechanical 或逐条纯机械且无聚合 LLM：无 llmStep
    if (llmSteps.length === 0) return [];

    const stepsDesc = llmSteps.map((s, i) => {
        let hint = "";
        switch (plan.dataFlow) {
            case "map":
                hint = "（处理单条数据，产出一段连贯文本作为一条结果）"; break;
            case "flatmap":
                hint = "（处理单条数据，可能产出多条结果，请逐条列出、每条独立成段、空行分隔）"; break;
            case "reduce_concat":
                hint = "（逐条处理，各结果将被按序拼接为整体，请产出连贯文本）"; break;
            case "reduce_synthesize":
                hint = i === 0 ? "（逐条处理单条数据，产出连贯文本）" : "（综合全部结果归纳为单一连贯文本产物）"; break;
            case "expand":
                hint = "（一次产出多条结果，请逐条列出、每条独立成段、空行分隔）"; break;
            case "direct":
                hint = "（处理输入，产出一段连贯完整的文本）"; break;
        }
        if (plan.sequential && i === 0 &&
            (plan.dataFlow === "map" || plan.dataFlow === "flatmap" || plan.dataFlow.startsWith("reduce"))) {
            hint += "（存在顺序依赖，会附带前序已处理结果作为上下文，请保持连贯）";
        }
        return `处理阶段 ${i + 1}：${s.label}${hint}`;
    }).join("\n");

    const outArr = pctx.gdag.getArtifact(node.outputs[0])?.isArray ?? false;
    const outputContractHint = outArr
        ? `输出为多条数据：约定执行者"逐条列出，每条独立成段、以空行分隔，每条自足可理解，不遗漏、不臆造"。此空行分隔格式必须明确写入 user，作为下游切分依据。`
        : `输出为单一数据：约定执行者"产出一段连贯完整的文本"。`;

    const nl = [
        PROMPT_GEN_INSTRUCTIONS,
        "",
        `### 全局目标（本工作最终服务于此，用于对齐判断标准）`,
        plan.globalGoal || "（未提供全局目标）",
        "",
        `### 本任务意图`,
        node.intent,
        `数据流转：${plan.summary}`,
        "",
        `### 输出契约要求（务必与形态一致）`,
        outputContractHint,
        "",
        `### 需要撰写提示词的处理阶段`,
        stepsDesc,
        "",
        `### 输入数据（含质量标准）`,
        artifactDesc(node, node.inputs, pctx),
        `### 输出数据（含质量标准）`,
        artifactDesc(node, node.outputs, pctx),
        "",
        `### 上下游语境（决定输出粒度与数据契约）`,
        neighborDesc(node, pctx),
    ].join("\n");

    // 单步骤优化
    if (llmSteps.length === 1) {
        const fmt = await safefmt(nl, Output.object({ schema: PromptPairSchema }), ctx);
        if (fmt.success && fmt.value?.output) {
            const v = fmt.value.output as PromptPair;
            Logger.debug(`[promptGen]「${node.name}」生成 1 对提示词`);
            return [v];
        }
    } else {
        const fmt = await safefmt(nl, Output.object({ schema: PromptListSchema }), ctx);
        if (fmt.success && fmt.value?.output) {
            const v = fmt.value.output as { prompts: PromptPair[] };
            if (v.prompts.length >= llmSteps.length) {
                Logger.debug(`[promptGen]「${node.name}」生成 ${v.prompts.length} 对提示词`);
                return v.prompts.slice(0, llmSteps.length);
            }
        }
    }

    // 兜底：模板化（仍面向数据处理，含全局目标 + 质量标准 + 形态适配的输出契约）
    Logger.warn(`[promptGen]「${node.name}」safefmt 失败，降级为模板提示词`);
    const outQuality = deriveQuality(node, node.outputs[0], pctx);
    const goalLine = plan.globalGoal ? `本工作服务于：${plan.globalGoal}。` : "";
    const outputContractLine = outArr
        ? `输出：请逐条列出所有结果，每条独立成段、以空行分隔，每条自足可理解，不遗漏、不臆造。`
        : `输出：请产出一段连贯完整的文本。`;
    return llmSteps.map((s) => ({
        system: `你是一名严谨的专业数据处理者，负责${s.label}。${goalLine}质量要求：${outQuality.join("；")}。`,
        user: [
            `任务：${node.intent}`,
            `输入：${node.inputs.join("、")}（随本条指令附上）。`,
            outputContractLine,
            `请严格符合上述质量要求。`,
            `边界：若输入无有效内容，请输出空结果，不要臆造。`,
        ].join("\n"),
    }));
}