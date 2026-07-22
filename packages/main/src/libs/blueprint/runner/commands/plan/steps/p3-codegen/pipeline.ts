/**
 * 单任务 reAct 流水线：
 *   1) planNode（规则 + 一次轻量 LLM 决策 + 全局目标/邻接注入）→ NodePlan
 *   2) genPromptsForNode(node, plan) → PromptPair[]
 *   3) genCodeForNode(node, plan, prompts) → code
 *   4) compile(code)：不过就带错误回到 3) 重试
 *   验收标准：compile.ok === true（仅 parse，不执行）
 *
 * promptGen 与 codeGen 消费同一份 NodePlan，形态严格一致。
 */

import type { PNode } from "$types/index.js";
import Logger from "electron-log/main.js";
import { GeneratedArtifact, PlanContext } from "../../context.js";
import { genCodeForNode } from "./codeGen.js";
import { compileCode } from "./compile.js";
import { CodeGenFailure } from "./index.js";
import { planNode } from "./plan.js";
import { genPromptsForNode } from "./promptGen.js";

const MAX_ROUNDS = 4;

export async function generateForNode(
    node: PNode, pctx: PlanContext,
): Promise<GeneratedArtifact> {
    // 1) 共享蓝图：同时驱动 promptGen 与 codeGen（已含全局目标 + 上下游语义）
    const plan = await planNode(node, pctx);
    Logger.debug(`[pipeline]「${node.name}」dataFlow=${plan.dataFlow}，LLM 步骤=${plan.llmSteps.length}，sequential=${plan.sequential}`);

    // 2) 提示词
    const prompts = await genPromptsForNode(node, plan, pctx);

    let priorError: string | null = null;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
        const code = await genCodeForNode(node, plan, prompts, pctx, priorError)
            .catch((e) => {
                throw new CodeGenFailure(
                    node.id, `codeGen LLM 调用失败：${(e as Error).message}`,
                    "检查模型可用性 / 减小任务意图长度",
                );
            });

        const result = compileCode(code);
        if (result.ok) {
            Logger.debug(`[pipeline]「${node.name}」第 ${round} 轮编译通过`);
            return { nodeId: node.id, code, prompts };
        }

        priorError = result.error ?? "未知编译错误";
        Logger.warn(`[pipeline]「${node.name}」第 ${round} 轮编译失败：${priorError}`);
    }

    throw new CodeGenFailure(
        node.id,
        `${MAX_ROUNDS} 轮编译均未通过，最后错误：${priorError}`,
        "考虑：拆分任务 / 降低复杂度 / 补充参考样本",
    );
}