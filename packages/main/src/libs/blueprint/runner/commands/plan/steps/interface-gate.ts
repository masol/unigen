/**
 * ============================================================================
 * 【子任务 P-30 · 闸门:接口铁律(纯代码)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:防层间接口漂移——分层批量展开唯一的新增硬风险,本文件是其唯一防线。
 * 校验(全部基于归一化后 fieldKey 的集合运算,无 LLM):
 *  1) 层内节点消费的"外部输入"(不由层内任何节点产出的 input)⊆ 父能力 input;
 *  2) 父能力 output ⊆ 层内节点 output 的并集(最终产出必须被覆盖);
 *  3) 层内每个节点的每个 input,要么来自父 input,要么恰有层内上游节点产出
 *     (悬空输入即断链);
 *  4) 违规逐条生成人话原因(含具体 fieldKey),供回炉提示词直接引用。
 * 验收:纯函数;针对 1-3 各写正/反用例。
 */
import type { GateResult, LayerPlan } from '../types.js';
export function checkInterfaceGate(
    plan: LayerPlan,
    parentInput: string[],
    parentOutput: string[],
): GateResult {
    void plan; void parentInput; void parentOutput;
    throw new Error('TODO P-30');
}