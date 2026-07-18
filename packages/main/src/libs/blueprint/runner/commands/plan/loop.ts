/**
 * ============================================================================
 * 【P-05 · 多 pass 主循环(编译器归约)】(附 BACKGROUND.md)
 * ============================================================================
 * 概念对齐 LLVM:一遍遍扫描、多 pass 把"图的图"归约到代码节点。
 * 库即黑板:每轮从库中取一个 name=#plan::* 的能力,按状态分发对应 pass,
 * pass 内部落库并推进状态。无内存队列;任意中断,重跑本函数无损续跑。
 * 无 #plan:: 残留 → Pass4 全图链接校验 → done。
 */
import { getPlanDesc, isPlanning, makePlanDesc } from '$libs/blueprint/capability/is.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import { Capability } from '$types/blueprint/capability.js';
import Logger from 'electron-log/main.js';
import {
    MAX_ITERATIONS, NODE_PENDING, PASS_CHAIN, PASS_CODEGEN,
    WORKFLOW_IMPOSSIBLE, WORKFLOW_PENDING,
} from './config.js';
import { PlanContext } from './context.js';
import { passChain } from './steps/chain.js';
import { passCodegen } from './steps/codegen.js';
import { passNode } from './steps/node.js';
import { passSchema } from './steps/solidify.js';
import { passVerify } from './steps/verify.js';

const tag = '[plan:loop]';

/** 取下一个待处理能力:根子树内 #plan::* 且非 impossible,浅层优先 */
function nextPlannable(pctx: PlanContext): Capability | null {
    // @TODO: PrjDB 增加按 name 前缀查询接口(根子树限定 + createdAt 排序)
    const caps = pctx.prjdb.listCapasByNamePrefix(makePlanDesc(''));
    return caps.find(
        (c) => isPlanning(c.name) && getPlanDesc(c.name) !== WORKFLOW_IMPOSSIBLE,
    ) ?? null;
}

export async function passLoop(rootCap: Capability, pctx: PlanContext): Promise<void> {
    for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
        const cap = nextPlannable(pctx);

        // ---- 终局:无待处理 → Pass4 链接校验(全部叶子须为 #code/#workflow) ----
        if (!cap) {
            await passVerify(rootCap, pctx);
            return;
        }

        const state = getPlanDesc(cap.name)!;
        Logger.info(`${tag} 轮次 ${iter}/${MAX_ITERATIONS} | pass=${state} | ${cap.id}`);
        pctx.notify(`Pass:${state}`, cap.goal);

        switch (state) {
            case WORKFLOW_PENDING: // Pass1: 交付物数据结构固化(工具先行)
                await passSchema(cap, pctx);
                break;
            case PASS_CHAIN:       // Pass2: 反向链路降级(binary建DAG/text转LLM节点)
                await passChain(cap, pctx);
                break;
            case NODE_PENDING:     // Pass2.5: 工具步落定(候选→工具id,assumed兜底)
                await passNode(cap, pctx);
                break;
            case PASS_CODEGEN:     // Pass3: 叶子发码(vm+PlanViolation契约)
                await passCodegen(cap, pctx);
                break;
            default:
                throwUnprcessable(`未知规划状态:${state}(${cap.id})`);
        }
    }

    // 轮次熔断:诚实报告而非硬撑
    pctx.trace(rootCap.id, 'loop', `达到轮次上限 ${MAX_ITERATIONS},未收敛`);
    throwUnprcessable(`规划未收敛:达到轮次上限 ${MAX_ITERATIONS}`);
}