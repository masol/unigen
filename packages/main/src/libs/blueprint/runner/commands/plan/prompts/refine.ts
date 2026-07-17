/**
 * ============================================================================
 * 【子任务 P-13 · 提示词:合并精炼(Prism S3)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:综合 5 棱面批判,改写层草稿。system 必须写清:
 *  1) 只在确有改进价值处修改,不为改而改;
 *  2) 若无需修改或改动更糟 → changed=false,原样返回(代码侧二值门据此回退);
 *  3) 修改后仍须遵守 expand 的全部 7 条硬规则(节点上限/接口铁律/术语纪律等);
 *  4) changed=true 时 changelog 逐条说明改动及对应棱面。
 * user 注入:父能力描述 / 当前层稿 JSON / 各棱面批判(格式化)。
 * 输出 schema: { changed, changelog[], refined: ExpandSchema同构 }。
 */
import { z } from 'zod';
import type { FacetCritique } from '../types.js';

export const REFINE_SYSTEM = `TODO(P-13)`;
export const refineUser = (p: {
    parentDesc: string;
    layerJson: string;
    critiques: FacetCritique[];
}): string => {
    void p;
    throw new Error('TODO P-13');
};
export const RefineSchema = z.object({
    // TODO(P-13): changed/changelog/refined
});