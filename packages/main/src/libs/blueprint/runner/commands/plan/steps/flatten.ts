/**
 * ============================================================================
 * 【P-Pass4 · flatten:多层 DAG 展平为单层可执行大 DAG】
 * ============================================================================
 */
import { throwUnprcessable } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { PlanContext } from "../context.js";

export async function flatten(pctx: PlanContext): Promise<string> {
    const gdag = pctx.gdag;
    if (!gdag.rootId) throwUnprcessable(`[flatten] 根层不存在`, true);

    const flatId = gdag.flatten();
    pctx.persist();

    const leaves = gdag.getGraph(flatId)?.order ?? 0;
    Logger.debug(`[flatten] 完成:展平为单层 DAG,共 ${leaves} 个可执行节点`);
    return flatId;
}