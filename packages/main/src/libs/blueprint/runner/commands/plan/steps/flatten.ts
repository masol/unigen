/**
 * ============================================================================
 * 【P-Pass5 · flatten:多层 DAG 展平为单层可执行大 DAG】
 * ============================================================================
 * 每个 expanded 节点被其子层替换:子层初始数据缝合到父节点上游,
 * 子层终端产物缝合到父节点下游。递归自底向上,最终得到全叶子单层 DAG。
 * 展平结果供代码生成阶段逐节点落码,整图按拓扑序执行产出最终交付物。
 */
import { throwUnprcessable } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { PlanContext } from "../context.js";

export async function flatten(pctx: PlanContext): Promise<string> {
    const gdag = pctx.gdag;
    if (!gdag.rootId) throwUnprcessable(`[flatten] 根层不存在`, true);

    const flatId = gdag.flatten(); // 见 gdag.flatten:自底向上缝合,返回单层图 id
    pctx.persist();

    const leaves = gdag.getGraph(flatId)?.order ?? 0;
    Logger.debug(`[flatten] 完成:展平为单层 DAG,共 ${leaves} 个可执行节点`);
    return flatId;
}