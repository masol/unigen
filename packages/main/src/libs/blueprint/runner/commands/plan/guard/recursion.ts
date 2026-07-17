/**
 * ============================================================================
 * 【子任务 P-32 · 闸门:递归守门(纯代码)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:在展开一个 draft 能力【之前】拦截失控递归——先于一切 LLM 调用,省钱且防死循环。
 * 校验:
 *  1) 深度上限:cap.depth >= args.depth → 拦截,原因 'depth_limit';
 *  2) 祖先链语义重复:沿 parentId 上溯取祖先 goal 链,当前 goal 与某祖先 goal
 *     高度相似(归一化后 diceSim ≥ 0.85,阈值进 config 新增常量)→ 拦截,
 *     原因 'goal_repeat:<祖先capId>'——这是"病态递归"(越拆越回到原问题)的信号;
 *  3) 被拦截 → 返回 {ok:false, reasons};loop 据此将该能力标 blocked(原因入
 *     blockReason),不再展开。诚实上报优于硬撑。
 * 注意:diceSim 实现放本文件导出(bigram Dice 系数,~20 行),s3 的术语预筛也
 * import 它——全模块唯一的相似度实现,禁止两份。
 * 验收:纯函数(祖先链由调用方查库传入);深度/重复各有正反用例。
 */
import type { GateResult } from '../types.js';

/** bigram Dice 相似度,全模块唯一实现(术语预筛与递归守门共用) */
export function diceSim(a: string, b: string): number {
    void a; void b;
    throw new Error('TODO P-32');
}

export function checkRecursion(p: {
    goal: string;
    depth: number;
    maxDepth: number;
    ancestorGoals: { capId: string; goal: string }[];
}): GateResult {
    void p;
    throw new Error('TODO P-32');
}