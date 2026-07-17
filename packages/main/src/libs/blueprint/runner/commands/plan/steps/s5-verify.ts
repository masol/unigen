/**
 * ============================================================================
 * 【子任务 P-25 · Step5:全局校验与交付(纯代码,无 LLM)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:主循环判定"无 draft"后的终检。全部代码实现:
 *  1) 从根能力递归遍历子树:所有叶子 status='atomic';
 *  2) 所有引用的 fieldKey 在 metag 存在且非悬空 aliasOf(解引用到正主);
 *  3) 逐层取 #workflow 定义重放 dag-check(防历史数据/手工改动破坏不变量);
 *  4) 上下文管控终检:所有 sizeHint=large/huge 术语的消费路径上,存在 chunk
 *     声明或切分节点;
 *  5) 全过 → KV-store 登记根能力 id(kv.ts,KV_ROOT_KEY 或调用方指定 key),
 *     返回统计 {layers, caps, terms};
 *  6) 任一不过 → 返回违规清单(capId+原因),loop 将其汇入 blocked 报告——
 *     终检失败必须可解释,严禁静默通过。
 * 验收:对手工构造的坏数据(环/悬空 fieldKey/巨石叶子)逐一能报出。
 */
import type { LoopResult } from '../types.js';

export async function verifyAndDeliver(rootCapId: string): Promise<LoopResult> {
    void rootCapId;
    throw new Error('TODO P-25');
}