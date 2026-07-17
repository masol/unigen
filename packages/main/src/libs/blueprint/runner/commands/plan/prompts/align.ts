/**
 * ============================================================================
 * 【子任务 P-14 · 提示词:术语对齐复核】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:判断新 fieldKey 候选是否与某已有 metag 条目为【同一实体】。
 * system 必须写清:比对依据是 intent(定义)的语义,不是名字相似;定义指向同物 →
 * reuse;仅名字像 → new;拿不准 → new + 低置信(严禁强行合并,代码侧低于
 * ALIGN_CONF_THRESHOLD 不合并并标 needsReview)。
 * user 注入:候选(fieldKey+intent) + 代码预筛出的 top-k 已有条目(fieldKey+intent)。
 * 输出 schema: { decision:'reuse'|'new', matched_key:string|null, confidence:0-1, reason }。
 * 注意:仅在代码相似度预筛命中(≥PRESCREEN_THRESHOLD)时才会被调用,低频。
 */
import { z } from 'zod';

export const ALIGN_SYSTEM = `TODO(P-14)`;
export const alignUser = (p: {
    candidate: { fieldKey: string; intent: string };
    topK: { fieldKey: string; intent: string }[];
}): string => {
    void p;
    throw new Error('TODO P-14');
};
export const AlignSchema = z.object({
    // TODO(P-14)
});