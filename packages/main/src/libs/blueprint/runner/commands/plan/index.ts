/**
 * ============================================================================
 * 【P-00 · 入口调度:拟人工作流规划器】
 * ============================================================================
 * 目标:拆解人类工作流 → 递归细化思维过程 → 标记 LLM 可模拟的叶子
 *     → 物理规划(规模适配) → 模拟可信度评估 → 展平为可执行 DAG。
 *
 * 本轮目标:初步可执行 + 结果初步可用。
 * 后续改进:执行后根据真实结果,归因到具体环节质量不足,定向改进。
 */
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import { MAX_ITERATIONS } from './config.js';
import { ConflictSignal, createPlanContext } from './context.js';
import { errorCheckPlan } from './steps/errorcheck.js';
import { flatten } from './steps/flatten.js';
import { logicalExpand } from './steps/logical.js';
import { physicalPlan } from './steps/physical/index.js';
import { designTop } from './steps/srs.js';

export async function runCmd(ctx: IRunnerContext): Promise<void> {
    const pctx = createPlanContext(ctx);

    for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        try {
            await designTop(pctx);        // 拆解人类顶层工作流
            await logicalExpand(pctx);    // 递归细化思维过程到 LLM 可模拟
            await physicalPlan(pctx);     // map-reduce/rag(规模适配)
            await errorCheckPlan(pctx);   // 模拟可信度评估 + 护栏标记
            const flatId = await flatten(pctx); // 展平为单层可执行 DAG

            ctx.notify("", "```json\n" +
                JSON.stringify(pctx.gdag.getGraph(flatId)?.export(), null, 2) + "\n```");
            return;
        } catch (e) {
            if (e instanceof ConflictSignal) continue;
            throw e;
        }
    }
    throwUnprcessable(`[plan] 规划未收敛:达到轮次上限 ${MAX_ITERATIONS}`, true);
}