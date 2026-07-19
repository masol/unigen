/**
 * ============================================================================
 * 【P-00 · 入口调度(多 pass 编译版)】
 * ============================================================================
 */
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import { MAX_ITERATIONS } from './config.js';
import { ConflictSignal, createPlanContext } from './context.js';
import { designTop } from './steps/srs.js';

export async function runCmd(ctx: IRunnerContext): Promise<void> {

    const pctx = createPlanContext(ctx)

    /**
     * 【暂不实现动态依赖自维护，采用“外层循环重入”作为替代方案】-- 生成的工作流也采用本方案
     * 注意：不同于工作流的执行，不跟踪节点/数据自身的变化，因此，对于人工修正不敏感--人修正部分节点后，重新plan不会触发后续重计算。
     * @todo: 将plan改造为工作流，以利用工作流提供的数据血缘支持。
     * 
     * 编译器内部步骤之间存在复杂的动态依赖关系。本版本不实现依赖追踪与局部精准回溯机制。
     * 
     * 🛠️ 当前实现机制：
     * 1. 采用最简单的“全量/部分重入”逻辑。如果深层出现逻辑矛盾，前置数据/约束需要变更时，直接抛异常。
     * 2. 此时不进行精细化局部回退，而是直接放弃本轮，将控制权交还外层循环，直接开启下一轮。
     * 3. 各子步骤需支持可重入，并在新一轮中根据修改后的 pctx 重新计算。
     * 
     * ⚖️ 性能与代码取舍：
     * 缺点是局部存在重复计算的开销，若 MAX_ITERATIONS 触发上限或整体变慢需重新评估。
     * 优点是实现简单。
     */
    for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        try {
            await designTop(pctx);

            ctx.notify("", "```json\n" + JSON.stringify(pctx.gdag.toJSON(), null, 2) + "\n\n```")
            return;
        } catch (e) {
            if (e instanceof ConflictSignal) {
                continue;
            }
            throw e;
        }
    }
    throwUnprcessable(`[plan] 规划未收敛:达到轮次上限 ${MAX_ITERATIONS}`, true);
    // await passLoop(cap, pctx);
}