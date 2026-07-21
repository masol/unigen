/**
 * ============================================================================
 * 【P-Pass2a · designTop:顶层人类工作流拆解】
 * ============================================================================
 * 人类做这件事的第一层思维拆解:从用户需求出发,参考人类流程先验,
 * 产出顶层 DAG。只做拟人化拆解,不做物理规划。
 */
import { throwNotimplement, throwUnprcessable } from "$libs/utils/err.js";
import { StepNames } from "../config.js";
import { PlanContext } from "../context.js";
import { designDag, makeTopTask, registerLayer } from "./dag.js";
import { fetchProcedurePrior } from "./skeleton.js";

export async function designTop(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;

    if (gdag.rootId && gdag.getGraph(gdag.rootId)) {
        const error = pctx.getNodeError(StepNames.dag);
        if (error) throwNotimplement("尚未实现顶层工作流的错误恢复。");
        return;
    }

    const body = (pctx.ctx.cmd.body ?? '').trim();
    if (!body) throwUnprcessable("[plan]:未提供任何要求。", true);

    const prior = await fetchProcedurePrior(body, pctx);
    const result = await designDag(makeTopTask(body, prior), pctx);
    await registerLayer(result, pctx, true);

    pctx.persist();
}