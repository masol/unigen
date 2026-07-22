/**
 * 单节点 reAct 流水线：
 *   1) planFlow（纯规则）→ FlowSpec
 *   2) genPromptsForNode → PromptPair[]
 *   3) genCodeForNode(node, flowSpec, prompts) → code
 *   4) compile(code)：不过就带错误回到 3) 重试
 *   验收标准：compile.ok === true
 */

import type { PNode } from "$types/index.js";
import Logger from "electron-log/main.js";
import { GeneratedArtifact, PlanContext } from "../../context.js";
import { genCodeForNode } from "./codeGen.js";
import { compileCode } from "./compile.js";
import { planFlow } from "./flow.js";
import { CodeGenFailure } from "./index.js";
import { genPromptsForNode } from "./promptGen.js";

const MAX_ROUNDS = 4;

export async function generateForNode(
    node: PNode, pctx: PlanContext,
): Promise<GeneratedArtifact> {
    const flowSpec = planFlow(node, pctx);
    Logger.debug(`[pipeline]「${node.name}」流程=${flowSpec.kind}，LLM 步骤=${flowSpec.steps.filter(s => s.needsLLM).length}`);

    const prompts = await genPromptsForNode(node, flowSpec, pctx.ctx);

    let priorError: string | null = null;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
        const code = await genCodeForNode(node, flowSpec, prompts, pctx.ctx, priorError)
            .catch((e) => {
                throw new CodeGenFailure(
                    node.id, `codeGen LLM 调用失败：${(e as Error).message}`,
                    "检查模型可用性 / 减小节点意图长度",
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
        "考虑：拆分节点 / 降低复杂度 / 补充参考样本",
    );
}