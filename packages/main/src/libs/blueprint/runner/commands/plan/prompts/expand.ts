/**
 * ============================================================================
 * 【子任务 P-11 · 提示词:单层展开(核心)】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:整个规划器最重要的提示词。给定一个父能力(goal + input/output fieldKey
 * 及其 metag 定义),让 LLM 一次吐出 ≤N 节点的完整子层 DAG。
 * system 必须写清的规则(全部硬性):
 *  1) 节点数 ≤ {maxNodes}(参数注入);节点可以复杂,但数量不得超;
 *  2) 节点=子能力草案:{name, goal, input[], output[], process, chunkNeeded};
 *     边不显式给出——由节点间 input/output fieldKey 的衔接推导(数据依赖即拓扑);
 *  3) 首尾接口铁律:本层所有节点消费的"外部输入"只能来自父能力的 input;
 *     本层最终产出必须覆盖父能力的 output——违反会被代码闸门整层拒绝;
 *  4) 术语纪律:优先复用【已有术语表】的 fieldKey,严禁另造近义词;确需新术语,
 *     在 terms[] 中声明(fieldKey/intent/sizeHint/splittable);
 *  5) 能力复用:【可复用能力清单】中 goal 匹配的直接引用其 name,不重复设计;
 *  6) 上下文管控:任何 sizeHint=large/huge 的输入,消费它的节点必须 chunkNeeded
 *     =true,或在本层显式插入切分/归约节点(map-reduce 形态);
 *  7) 层内必须是 DAG(无环,无孤岛节点,每个节点都在父 input→父 output 的通路上)。
 * user 注入参数:父能力描述 / 已有术语表摘要 / 可复用能力清单 / maxNodes /
 *  (回炉时)上次被拒原因 rejectReasons —— 带原因重生成是层级回溯的关键。
 * 输出 schema: { nodes: CapDraft形[], terms: TermDraft形[], rationale }
 * 每个 zod 字段写中文 description。验收:schema 与 types.ts 的 LayerPlan 字段兼容。
 */
import { z } from 'zod';

export const EXPAND_SYSTEM = `TODO(P-11): 按上述 7 条硬规则撰写`;
export const expandUser = (p: {
    parentDesc: string;      // 父能力 goal + input/output 及其 metag intent
    registrySummary: string; // 已有术语表摘要(fieldKey: intent [sizeHint])
    reusableCaps: string;    // 可复用能力清单(name: goal)
    maxNodes: number;
    rejectReasons?: string[];// 回炉时注入上次闸门拒绝原因
}): string => {
    void p;
    throw new Error('TODO P-11');
};
export const ExpandSchema = z.object({
    // TODO(P-11): nodes / terms / rationale,与 types.ts LayerPlan 兼容
});