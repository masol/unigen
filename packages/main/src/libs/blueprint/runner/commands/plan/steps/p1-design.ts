/**
 * ============================================================================
 * 【P-Pass1 · designTop:顶层人类工作流拆解】
 * ============================================================================
 */
import { throwUnprcessable } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { StepNames } from "../config.js";
import { PlanContext } from "../context.js";
import { designDag, makeTopTask, registerLayer } from "./dag.js";
import { fetchProcedurePrior } from "./skeleton.js";

export async function designTop(pctx: PlanContext): Promise<void> {
    const gdag = pctx.gdag;

    if (gdag.rootId && gdag.getGraph(gdag.rootId)) {
        const error = pctx.getNodeError(StepNames.dag);
        if (error) {
            Logger.warn(`[designTop] 重入时发现错误,暂不支持恢复:\n${error}`);
        }
        return;
    }

    const body = (pctx.ctx.cmd.body ?? '').trim();
    if (!body) throwUnprcessable("[plan]:未提供任何要求。", true);

    const prior = await fetchProcedurePrior(body, pctx);
    const result = await designDag(makeTopTask(body, prior), pctx);
    await registerLayer(result, pctx, true);

    pctx.persist();
}