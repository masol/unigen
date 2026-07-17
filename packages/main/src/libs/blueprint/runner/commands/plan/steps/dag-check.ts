/**
 * ============================================================================
 * 【子任务 P-31 · 闸门:层内 DAG 校验(纯代码)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:校验一层节点构成合法 DAG。边由数据依赖推导:节点 A 的 output 与节点 B
 * 的 input 有 fieldKey 交集 → 边 A→B。校验项:
 *  1) 无环:推导出边后跑环检测(可用 graphology + graphology-dag 的
 *     willCreateCycle 逐边构建,或手写 Kahn 拓扑排序判环——实现者选,注释说明);
 *  2) 无孤岛:每个节点都在"父 input → 父 output"的通路上(即每个节点从某外部
 *     输入可达,且可达某最终产出;不满足=凑数节点);
 *  3) 无重复产出者:同一 fieldKey 被层内多个节点产出 → 报错(数据来源必须唯一,
 *     这是 workflow 可执行的前提;合流需求应显式设计归约节点);
 *  4) 顺带产出拓扑排序结果(returns.order),供 s3 写入 #workflow 定义作执行序缓存。
 * 违规逐条生成人话原因(含节点 name 与 fieldKey)。
 * 验收:纯函数;环/孤岛/重复产出各有正反用例。
 */
import type { GateResult, LayerPlan } from '../types.js';

export function checkLayerDag(
    plan: LayerPlan,
    parentInput: string[],
    parentOutput: string[],
): GateResult & { order?: string[] } {
    void plan; void parentInput; void parentOutput;
    throw new Error('TODO P-31');
}