/**
 * ============================================================================
 * 目录：src/types —— 全局类型契约（Shared Type Contracts）
 * ============================================================================
 * 【子任务】定义跨模块流动的数据契约。只放类型与 zod schema，不放运行逻辑。
 * 所有业务模块依赖本目录；本目录不依赖任何业务模块（依赖图叶子，零副作用）。
 *
 * 【契约清单】
 * 1) 图模型（§4）
 *    - NodeType   = 'primitive'|'compound'|'unknown'
 *    - NodeStatus = 'known'|'pending'
 *        known 仅当真闭包回填成立才可置位；pending 为默认（已登记未证明触底）。
 *    - GraphNode  = {id, type, status}   // id 恒为归一化 snake_case
 *    - MethodOrdering = 顺序约束（subtask id 的偏序/全序）
 *    - MethodNode = {id, parentCompound, subtaskIds[], ordering}
 *        一个 compound 挂多个 MethodNode = OR；一个 method 内 subtaskIds = AND。
 *
 * 2) 词表对齐（§5 / P6）
 *    - LexId = string（稳定归一化 ID）
 *    - AlignResult = {decision:'reuse'|'new', matchedId?, confidence 0..1}
 * 低置信不自动合并：契约要求返回 'new' + 待人工确认标记。
 *
 * 3) 自举与拆解（§6.2 / P4、P5）
 * - PrimitiveAction = { name, pre: string[], eff: string[] }
 * - BootstrapResult = { initStates[], primitiveActions[], targetAttributes[] }
 * - Method          = { subAttributes: string[], ordering: MethodOrdering }
 * - DecomposeResult = { isGrounded: boolean, methods: Method[] }
 * isGrounded=true → 已触底，methods 可空；false → methods≥1 且鼓励多 method(OR)。
 *
 * 4) 多视角评估（1.3 / P1 - P3）
 * - Dimension       = { name, checksWhat, why }          // ≤5
 * - Critique        = { dimension, score, issues[], fixes[] }
 * - RefineResult<A> = { artifact: A, changed: boolean, changelog: string[] }
 *
 * 5) HDDL 与解算（§6 / P7、P8）—— v1 / v2 求解器的共同锚点
    * - HddlTask   = { task, method: { name, subtasks[], ordering[] } }
 * - HddlDomain = { tasks: HddlTask[], primitives: PrimitiveAction[] }
 * - Fact       = { predicate, args[], t }   // 带时间步的事实（§6.3 时序事实链）
 * - SolveInput = { hddl: HddlDomain, initFacts: Fact[], goal: string }
 * - SolveResult= { planFound: boolean, actionSequence[], assumptions[] }
 *      ⚠ SolveInput / SolveResult 是 simulateSolve(v1) 与 Prolog(v2) 的共同契约，
 * 任何字段改动同时约束两代求解器 —— 「无缝替换」的锚点。
 *
 * 【实现要求】
 * - 每个「LLM 产出型」契约配一个 zod schema（导出 XxxSchema），供 prompts 的
    * generateObject 直接引用；类型用 z.infer 反导出（类型≡运行时校验，单一事实源）。
 * - 纯图结构类型无需 zod（不过 LLM 边界）。此处不写函数实现。
 */
// 全局契约。v1 用普通 TS 类型；真实版这些「LLM 产出型」应配 zod schema（单一事实源）。



export type NodeType = 'primitive' | 'compound' | 'unknown';
export type NodeStatus = 'known' | 'pending';

export interface Method { subAttributes: string[]; ordering: 'sequential' | 'parallel'; }
export interface DecomposeResult { isGrounded: boolean; methods: Method[]; }

export interface PrimitiveAction { name: string; pre: string[]; eff: string[]; }
export interface BootstrapResult {
    initStates: string[];
    primitiveActions: PrimitiveAction[];
    targetAttributes: string[];
}

// 解算层契约 —— v1(simulateSolve) 与 v2(Prolog) 的共同锚点。改这里同时约束两代求解器。
export interface HddlTask {
    task: string;
    methods: { name: string; subtasks: string[]; ordering: 'sequential' | 'parallel' }[];
}
export interface HddlDomain { tasks: HddlTask[]; primitives: PrimitiveAction[]; }
export interface SolveInput { hddl: HddlDomain; initFacts: string[]; goal: string; }
export interface SolveResult { planFound: boolean; actionSequence: string[]; assumptions: string[]; }

export interface AlignResult { decision: 'reuse' | 'new'; matchedId?: string; confidence: number; }

export interface ExtractedGoal { rawText: string; goal: string; inputHint?: string; outputHint?: string; }
export type ExtractResult =
    | { ok: true; goal: ExtractedGoal }
    | { ok: false; code: 'NO_GOAL' | 'TOO_VAGUE' | 'EXTRACT_FAILED'; reason: string };