/**
 * 提示词生成器：独立上下文，零 few-shot。
 * 根据 FlowSpec 产出对应数量的 PromptPair（每个 LLM 调用点一对）。
 * 不接触任何 SDK 细节。
 */

import { safefmt } from "$libs/model/llm/outline.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { PNode } from "$types/index.js";
import { Output } from "ai";
import Logger from "electron-log/main.js";
import { z } from "zod";
import { PromptPair } from "../../context.js";
import type { FlowSpec } from "./flow.js";

const PromptPairSchema = z.object({
    system: z.string().describe("节点级系统提示词：定义该思维环节的角色、视角与行为约束。陈述句。"),
    user: z.string().describe("节点级用户提示词：包含任务描述 + 输入数据占位引用 + 输出规范。只描述意图与数据形态，不描述 JS API。"),
});

const PromptListSchema = z.object({
    prompts: z.array(PromptPairSchema).describe("按流程步骤顺序排列的提示词对列表"),
});

// const PROMPT_GEN_INSTRUCTIONS = `你是节点提示词设计师。

// 给定一个思维环节（name/intent/inputs/outputs）以及它的内部处理流程，
// 为流程中每一个需要 LLM 调用的步骤生成一对提示词（system + user）。

// 约束：
// 1. 禁止出现 JS / TS / SDK / 库名 / 函数名。只描述"做什么、产出什么形态"。
// 2. system 是角色定义（2-4 句陈述句）。
// 3. user 是具体任务指令（含输入形态描述、输出形态描述、注意事项）。
// 4. 若流程是 map/reduce 模式，user 里说明"你正在处理集合中的一条数据"或"你正在聚合多条结果"。
// 5. 若输出需要 safefmt 提取为数组，user 里说明"请以自然语言列出多条结果，每条独立成段"。
// 6. 不要复述 intent 原文——精炼为可执行指令。
// 7. 严格按流程步骤数量输出 prompts 数组（如流程有 2 个 LLM 步骤就输出 2 对）。`;

export async function genPromptsForNode(
    node: PNode, flowSpec: FlowSpec, ctx: IRunnerContext,
): Promise<PromptPair[]> {
    const llmSteps = flowSpec.steps.filter(s => s.needsLLM);

    // MECHANICAL 或无 LLM 步骤：不需要提示词
    if (llmSteps.length === 0) return [];

    const ioDesc = (names: string[]): string =>
        names.map(n => `- ${n}`).join("\n");

    const stepsDesc = llmSteps.map(s =>
        `步骤${s.index}：${s.label}${s.needsSafefmt ? "（需结构化提取）" : ""}`
    ).join("\n");

    const nl = [
        `节点：${node.name}`,
        `意图：${node.intent}`,
        `流程形态：${flowSpec.kind}`,
        `流程概述：${flowSpec.summary}`,
        ``,
        `需要生成提示词的步骤：`,
        stepsDesc,
        ``,
        `输入：`,
        ioDesc(node.inputs),
        `输出：`,
        ioDesc(node.outputs),
    ].join("\n");

    // 单步骤优化：直接用 PromptPairSchema
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
            Logger.debug(`[promptGen]「${node.name}」生成 ${v.prompts.length} 对提示词`);
            return v.prompts;
        }
    }

    // 兜底：模板化
    Logger.warn(`[promptGen]「${node.name}」safefmt 失败，降级为模板提示词`);
    return llmSteps.map(s => ({
        system: `你是负责「${node.name}」第${s.index}步（${s.label}）的执行节点。`,
        user: `意图：${node.intent}\n输入：${node.inputs.join(", ")}\n产出：${node.outputs.join(", ")}`,
    }));
}