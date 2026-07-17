/**
 * ============================================================================
 * 【子任务 P-23 · Step3:闸门+落库(代码作骨的核心)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:把 LayerPlan 安全写入两张表。流程(顺序硬性):
 *  1) guard/interface-gate:子层与父能力接口铁律校验;
 *  2) guard/dag-check:层内 DAG 校验(无环/无孤岛/衔接完整);
 *  3) 任一不过 → 返回 {ok:false, reasons}(loop 据此带原因回炉 s2,绝不落库);
 *  4) 术语落库:每个 TermDraft 走 resolveTerm——归一化 → metag 精确命中即复用 →
 *     diceSim 预筛≥PRESCREEN_THRESHOLD 调 callLLM(prompts/align) →
 *     reuse 且 confidence≥ALIGN_CONF_THRESHOLD → 写 aliasOf 复用正主;
 *     否则新建(低置信标 needsReview)。CapDraft 中引用的 fieldKey 统一替换为
 *     解析后的正主 key(层内一致性由代码保证);
 *  5) 能力落库:每个 CapDraft → capabilities 行(parentId=父,depth=父+1,
 *     status='draft',chunk 按 chunkNeeded 映射);
 *  6) 父能力:status='planned',code 写入 #workflow 定义(子能力 id + fieldKey
 *     依赖边的 JSON,格式在本文件内定义并导出 WorkflowDef 类型——它是执行器
 *     消费的契约,字段注释写全),planTrace 追加本层 trace;
 *  7) 全部写库在一个事务内(drizzle transaction),闸门后任何失败整层回滚。
 *  8) dry 模式:走完 1-4 的"演算"但不写库,返回预览。
 * 验收:闸门拒绝时库无任何变更;事务中断不留半层数据。
 */
import type { IRunnerContext } from '$types/blueprint/context.js';
import type { GateResult, LayerPlan, PlanArgs } from '../types.js';

export interface WorkflowDef {
    // TODO(P-23): 子能力 id 列表 + 依赖边(fieldKey 衔接) + 执行序(拓扑排序缓存)
}

export async function persistLayer(p: {
    plan: LayerPlan;
    args: PlanArgs;
    ctx: IRunnerContext;
}): Promise<GateResult & { capIds?: string[] }> {
    void p;
    throw new Error('TODO P-23');
}