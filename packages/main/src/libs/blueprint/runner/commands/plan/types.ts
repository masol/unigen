/**
 * ============================================================================
 * 【子任务 P-03 · 共享类型契约】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:全模块的类型锚点。所有 steps/guard/store 只依赖本文件通信。
 * 本文件为契约,已冻结;实现子任务如需扩展,新增字段必须可选(?)。
 * 注意:这里是"内存中的工作类型",与 drizzle 表行的映射在 store/ 完成。
 */

/** 层内一个子能力草案(LLM 产出,尚未落库) */
export interface CapDraft {
    name: string;                 // snake_case;#workflow 等内部名由代码补,LLM 不产
    goal: string;                 // 能力职责——一切推导的起点字段
    input: string[];              // metag fieldKey 数组(AND:全就绪才可执行)
    output: string[];             // metag fieldKey 数组
    process: string;              // 这一步做什么(一句话,动词开头)
    chunkNeeded: boolean;         // 可切分性审查结论:输入超上下文需分块处理
}

/** 层内新术语声明(与 CapDraft 一起由 LLM 产出) */
export interface TermDraft {
    fieldKey: string;             // snake_case
    intent: string;               // 一句话定义——对齐复核比对的是它,必须写清
    sizeHint: 'small' | 'large' | 'huge';
    splittable: 'no' | 'by_item' | 'by_chapter' | 'by_semantic';
}

/** 一次单层展开的完整产物(s2 输出 → s3 输入) */
export interface LayerPlan {
    parentCapId: string;
    nodes: CapDraft[];            // ≤ config.MAX_LAYER_NODES
    terms: TermDraft[];           // 本层新增/引用的术语声明
    rationale: string;            // LLM 的设计说明(留痕进 planTrace)
}

/** 接口闸门/DAG 校验的统一结果 */
export type GateResult = { ok: true } | { ok: false; reasons: string[] };

/** 复杂度判定结果(s4) */
export interface ComplexityVerdict {
    atomic: boolean;
    complexity: 'low' | 'mid' | 'high';
    chunkNeeded: boolean;
    reason: string;
}

/** 主循环结果 */
export type LoopResult =
    | { ok: true; rootCapId: string; stats: { layers: number; caps: number; terms: number } }
    | { ok: false; rootCapId: string; blocked: { capId: string; goal: string; reason: string }[] };

/** Prism 批判条目(facets.ts 固定棱面 → refine.ts 消费) */
export interface FacetCritique {
    facet: string;
    score: number;                // 0..10
    issues: string[];
    fixes: string[];
}