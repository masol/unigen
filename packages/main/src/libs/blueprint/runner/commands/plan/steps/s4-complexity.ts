/**
 * ============================================================================
 * 【子任务 P-24 · Step4:复杂度判定(触底判定)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:对 s3 刚落库的每个子能力判定 atomic 与否。
 *  1) 代码速判(免 LLM):goal 与某已有 atomic/verified 能力高度相似(s0 检索命中)
 *     → 直接 atomic 并在 planTrace 记"复用判定";
 *  2) 其余 callLLM(prompts/complexity);
 *  3) atomic=true → capability-repo 更新 status='atomic',atomic=true;
 *     chunkNeeded 与落库值不一致时以判定为准更新 chunk;
 *  4) atomic=false → 保持 status='draft'(等 loop 下轮展开),complexity 记入
 *     planTrace;
 *  5) pMap 并发处理本层全部子能力(并发走 config)。
 * 验收:速判命中率有日志统计;判定失败(LLM 异常)不阻塞其它节点,该节点保持
 * draft 并记 planTrace,由下轮重试。
 */
import type { IRunnerContext } from '$types/blueprint/context.js';
import type { ComplexityVerdict } from '../types.js';

export async function judgeComplexity(
    capIds: string[],
    ctx: IRunnerContext,
): Promise<Map<string, ComplexityVerdict>> {
    void capIds; void ctx;
    throw new Error('TODO P-24');
}