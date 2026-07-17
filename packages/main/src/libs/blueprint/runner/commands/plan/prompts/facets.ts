/**
 * ============================================================================
 * 【子任务 P-12 · 提示词:固定棱面批判(Prism S2')】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:定义 5 个固定棱面 + 单模板参数化的批判 system/user + zod schema。
 * 单层展开是同构任务,棱面固定,不做动态拆分(省掉 Prism 的 S1)。
 * 五个固定棱面(名称冻结,代码依赖):
 *  1) completeness    层内节点合起来能否达成父 goal?有无缺件/隐含依赖未写出?
 *  2) topology        是否 DAG?有无环/孤岛?input/output 衔接是否断链?
 *                     首尾是否严格对齐父能力接口?
 *  3) granularity     节点数≤上限?有无"一个节点干全部"或凑数空节点?
 *  4) reuse_fit       能复用已有术语/能力的地方是否复用了?有无近义新词?
 *  5) chunk_safety    可切分性:large/huge 输入是否有 chunk 声明或切分节点?
 *                     切分后归约(reduce)节点是否存在?
 * 要求:
 *  - critiqueSystem(facet) 强调"只从本棱面发言,不越界";
 *  - critiqueUser 注入:父能力描述 / 层草稿 JSON / 术语表摘要;
 *  - schema: { facet, score(0-10), issues[], fixes[] },与 types.ts FacetCritique 一致。
 */
import { z } from 'zod';

export const FIXED_FACETS = [
    { name: 'completeness', checksWhat: 'TODO(P-12)' },
    { name: 'topology', checksWhat: 'TODO(P-12)' },
    { name: 'granularity', checksWhat: 'TODO(P-12)' },
    { name: 'reuse_fit', checksWhat: 'TODO(P-12)' },
    { name: 'chunk_safety', checksWhat: 'TODO(P-12)' },
] as const;

export const critiqueSystem = (facet: { name: string; checksWhat: string }): string => {
    void facet;
    throw new Error('TODO P-12');
};
export const critiqueUser = (p: {
    parentDesc: string;
    layerJson: string;
    registrySummary: string;
    facet: { name: string };
}): string => {
    void p;
    throw new Error('TODO P-12');
};
export const CritiqueSchema = z.object({
    // TODO(P-12): facet/score/issues/fixes
});