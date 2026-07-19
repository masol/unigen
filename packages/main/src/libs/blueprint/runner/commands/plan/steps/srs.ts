
// ─── 步骤入口：顶层设计(harness 的第一遍) ─────────────────────────────────

import { throwNotimplement, throwUnprcessable } from "$libs/utils/err.js";
import { StepNames } from "../config.js";
import { PlanContext } from "../context.js";
import { designDag, makeTopTask, registerLayer } from "./dag.js";

export async function designTop(pctx: PlanContext): Promise<void> {
    // const { prjdb } = pctx;
    // const cap = prjdb.getCapaById(pctx.rootCapId);

    const gdag = pctx.gdag;
    // 可重入：createPlanContext 已 restore()，图在则第一遍已完成，不重算
    if (gdag.rootId && gdag.getGraph(gdag.rootId)) {
        const error = pctx.getNodeError(StepNames.dag);
        if (error) {
            // @todo 用 makeRefineTask 定位矛盾节点回喂重设计；当前版本走外层重入
            throwNotimplement("尚未实现顶层规划的错误恢复。")
        }
        return;
    }

    const body = (pctx.ctx.cmd.body ?? '').trim();
    if (!body) {
        throwUnprcessable("[plan dag]:未提供任意要求。", true);
    }

    // 内存中完成:设计 → 归一登记 → 建根层 → 状态挂上下文
    const result = await designDag(makeTopTask(body), pctx);
    await registerLayer(result, pctx, true);
    // pctx.blueprint = result;

    // 暂不落盘，全程依赖kv-store,最终完毕再落盘。
    // if (!cap) {
    //     prjdb.upcertCapa({
    //         id: pctx.rootCapId,
    //         name: makePlanDesc(StatusNames.pending),
    //     });
    // }

    // 有意义的点:第一遍完成，整体落盘一次(gdag + blueprint 一个 blob)
    pctx.persist();

    /*
     * 后续 harness 循环(下一 pass)：
     *   while (gdag.scan('pending').length > 0) {
     *     取节点 → makeExpandTask(node) → designDag → registerLayer
     *       → attachSubDag(node.id, layerId)
     *     全图校验(边界io一致/无环/schema细化) →
     *       矛盾定位到节点 → updateNode(status:'conflict', error) → 重生成
     *     每轮收敛点 pctx.persist() 一次
     *   }
     * 直到所有叶子 awaiting_code，进入代码/capability 落盘环节。
     */
}