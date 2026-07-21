/**
 * ============================================================================
 * 【P-discuss · 单次/多轮生成人类处理流程】
 * ============================================================================
 * RAG 未命中时的兜底:用 LLM 给出"人类处理此任务的标准步骤 + 中间交付物"。
 *
 * 两种模式:
 *   runReview=false → 单次生成,直接返回
 *   runReview=true  → 生成 + 宽松评审循环(refeed 重画),收敛后返回
 *
 * 评审只关注两点:
 *   1. 质量:步骤是否真实、是否为该领域通行做法(而非臆造)
 *   2. 真实性:中间交付物是否具体可操作(不是空泛口号)
 *
 * 不检查:人在环(LLM 可模拟脑力活动)、粒度、依赖(下游 dag 阶段覆盖)。
 * 轮次耗尽仍返回最后一版——有瑕疵的流程仍比空串对下游更有价值。
 */
import { getSmartModel } from "$libs/model/index.js";
import { generateText, type ModelMessage } from "ai";
import Logger from "electron-log/main.js";
import { PlanContext } from "../context.js";

const MAX_ROUNDS = 3;

// ─── 生成器 ────────────────────────────────────────────────────────────────

const GENERATOR_INSTRUCTIONS = `你是领域专家。给定一个数据处理/业务自动化目标,描述一位资深人类专家会如何分步处理它。

## 输出格式(自然语言分节,不要输出 JSON)
### 步骤清单
每步一行:【步骤名】输入是什么 → 做什么 → 产出什么中间交付物。
步骤说明里若出现"然后/接着/再",说明它其实是两步,必须拆开。

### 中间交付物清单
把步骤中提到的所有中间产物按顺序列出,每项一行:
- 名称:交付物的清晰名称(脱离上下文可理解)
- 说明:这份数据/文档是什么,产出后被谁消费

## 规则
- 只讲人类在做什么、产出什么。不讲工具/技术/性能/界面。
- 中间交付物名全文统一,同份数据一个名字。
- 禁止提问。目标模糊时采用该领域最通行解释推进。
- 步骤数量最小化,能合并的合并。`;

// ─── 宽松评审 ──────────────────────────────────────────────────────────────

const REVIEW_INSTRUCTIONS = `你是人类处理流程的宽松评审器。只关注质量和真实性,只拦致命问题。

只看两点:
1. 真实性:步骤是否为该领域人类公认的通行做法?有无明显臆造、捏造的步骤或交付物?
2. 质量:中间交付物是否具体可操作?名称是否脱离上下文可理解?有无空泛口号式的交付物(如"优化结果""处理产物")?

以下不检查(一律放过):
- 是否需要人参与(LLM 可模拟脑力活动,写作/分析/判断不算问题)
- 粒度粗细(下游会处理)
- 依赖先后(下游会处理)
- 措辞风格

无致命问题输出单行:PASS
有则逐条:ISSUE: [哪一步/哪个交付物] [问题] [修正方向]
只输出上述格式。`;

// ─── 对外接口 ──────────────────────────────────────────────────────────────

export interface DiscussOptions {
    runReview?: boolean;
}

export async function generateProcedure(
    query: string, pctx: PlanContext, opts: DiscussOptions = {},
): Promise<string> {
    const messages: ModelMessage[] = [{ role: "user", content: query }];

    if (!opts.runReview) {
        // 单次生成,不评审
        const { text } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: GENERATOR_INSTRUCTIONS,
            messages,
        });
        Logger.debug(`[discuss] 单次生成流程 len=${text.length}`);
        return text;
    }

    // 带评审的循环
    let lastProcedure = "";

    for (let round = 1; round <= MAX_ROUNDS; round++) {
        // 生成/修订
        const { text: procedure } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: GENERATOR_INSTRUCTIONS,
            messages,
        });
        messages.push({ role: "assistant", content: procedure });
        lastProcedure = procedure;

        // 宽松评审
        const { text: verdict } = await generateText({
            model: getSmartModel(undefined, pctx.ctx),
            instructions: REVIEW_INSTRUCTIONS,
            prompt: `目标任务:${query}\n\n待评审流程:\n${procedure}`,
        });
        const issues = verdict.split("\n")
            .map(l => l.trim())
            .filter(l => /^ISSUE:/i.test(l));

        if (issues.length === 0) {
            Logger.debug(`[discuss] 第 ${round} 轮评审 PASS`);
            return procedure;
        }

        // refeed
        Logger.warn(`[discuss] 第 ${round} 轮评审 ${issues.length} 条 ISSUE:\n${issues.join("\n")}`);
        messages.push({
            role: "user",
            content: `评审指出以下问题:\n${issues.join("\n")}\n\n请修正后重新输出完整流程,保持无问题部分不变,不要引入新问题。`,
        });
    }

    // 轮次耗尽,返回最后一版
    Logger.warn(`[discuss] ${MAX_ROUNDS} 轮后评审仍未 PASS,返回最后一版`);
    return lastProcedure;
}