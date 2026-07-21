/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================================
 * 【P-Pass4 · errorCheckPlan:模拟可信度评估 + 护栏标记】
 * ============================================================================
 * 在全 DAG 固化后,评估每个 LLM 模拟环节的可信度:
 * "LLM 模拟人类在这步的思维,产出错误结果的概率有多大?"
 *
 * 高/中风险环节标记护栏,代码生成阶段包为 validate+critique wrapper:
 *  - validate:对输出做规则/schema 校验(确定性代码)
 *  - critique:LLM 自评"人类同行会如何评价这步的质量"
 *  - 失败触发有限次重试(执行期语义)
 *
 * 确定性环节(codeable=yes)恒 low:代码不会出"思维错误"。
 */
import { getSmartModel } from "$libs/model/index.js";
import { PNode, RiskLevel } from "$types/shared/plan/nodes.js";
import { generateText } from "ai";
import Logger from "electron-log/main.js";
import { ERRORCHECK_RISK_LEVELS } from "../config.js";
import { PlanContext } from "../context.js";
import { FacetNames, getFacet, NodeStatusValue } from "../graph/gdag.js";

const RISK_PROMPT = `你是 LLM 模拟可信度裁判。

一个人类思维环节将由 LLM 来模拟。判断:LLM 在单次执行中产出错误结果的概率。

考量:
- 思维开放度:越开放(创作/综合判断)越容易跑偏;越受限(抽取/分类/格式化)越可靠。
- 输出约束:有 schema/格式/长度约束 → 可靠;自由文本 → 偏高风险。
- 上下文依赖:需要综合大量上下文 → 遗漏风险;只看局部 → 可靠。
- 可验证性:输出容易由规则验证 → 低风险(错了能发现);难以自动验证 → 高风险。

输出单行:LOW / MEDIUM / HIGH。不要输出其他内容。`;

async function judgeRisk(node: PNode, pctx: PlanContext): Promise<RiskLevel> {
    const { text } = await generateText({
        model: getSmartModel(undefined, pctx.ctx),
        instructions: RISK_PROMPT,
        prompt: `思维环节:${node.name}\n人类在做什么:${node.intent}\n类型:${node.kind}`,
    });
    const line = text.trim().toUpperCase();
    if (line.startsWith('HIGH')) return 'high';
    if (line.startsWith('MEDIUM')) return 'medium';
    return 'low';
}

export async function errorCheckPlan(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;
    let guarded = 0;

    for (const { node } of gdag.scan(NodeStatusValue.awaiting_code)) {
        // 确定性环节 + 合成环节不需要模拟可信度评估
        if (getFacet(node, FacetNames.codeable) === 'yes' || node.synthetic) {
            gdag.updateNode(node.id, { risk: 'low' });
            continue;
        }

        const risk = await judgeRisk(node, pctx);
        const guard = ERRORCHECK_RISK_LEVELS.includes(risk as any);
        gdag.updateNode(node.id, {
            risk,
            ...(guard ? { guard: true, guardKinds: ['validate', 'critique'] } : {}),
        });

        if (guard) {
            guarded++;
            Logger.debug(`[errorcheck]「${node.name}」risk=${risk},标记护栏`);
        }
    }

    pctx.persist();
    Logger.debug(`[errorcheck] 完成:${guarded} 个环节需要执行期护栏`);
}