/**
 * ============================================================================
 * 【子任务 P-15 · 提示词:复杂度判定】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:判定单个子能力是否 atomic(可由执行器一步完成:一次 LLM 调用/一个已有
 * functor/一次工具调用),还是需要继续递归展开。
 * system 必须写清判定标准:
 *  - atomic 的必要条件:目标单一、无内部多阶段依赖、输入体量在单次上下文内
 *    (或已声明 chunk 模式可逐块同构处理);
 *  - 倾向保守:拿不准 → atomic=false(宁多拆一层,不留巨石节点);
 *  - 同时复核 chunkNeeded(输入 sizeHint=large/huge 而未声明 chunk → 指出)。
 * user 注入:能力 goal/input/output/process + 各输入的 metag intent/sizeHint。
 * 输出 schema 与 types.ts ComplexityVerdict 一致:
 *  { atomic, complexity:'low'|'mid'|'high', chunkNeeded, reason }。
 */
import { z } from 'zod';

export const COMPLEXITY_SYSTEM = `TODO(P-15)`;
export const complexityUser = (p: {
    capDesc: string;          // goal/input/output/process
    inputTerms: string;       // 各输入 fieldKey: intent [sizeHint/splittable]
}): string => {
    void p;
    throw new Error('TODO P-15');
};
export const ComplexitySchema = z.object({
    // TODO(P-15)
});