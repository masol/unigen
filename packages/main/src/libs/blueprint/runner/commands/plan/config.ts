
// /**
//  * ============================================================================
//  * 【子任务 P-02 · 常量配置】(附 BACKGROUND.md)
//  * ============================================================================
//  * 职责:全模块唯一的"改数字的地方"。所有阈值/上限集中于此,其它文件禁止写魔法数。
//  * 本文件已完成,后续子任务只允许"新增"常量,不允许改语义。
//  */

export const MAX_ITERATIONS = 100;      // 主循环熔断轮次:后续抛出错误，如果是逻辑可回溯问题，需要回溯重新计算。-- 当前版本人工维护，未引入符号跟踪机制。
export const TOOL_SEARCH_LIMIT = 8;
/** Fuse 相似度阈值：score 低于此值视为"疑似相同"，交 LLM 归一裁决 */
export const ARTIFACT_FUZZY_THRESHOLD = 0.35;
// /**
//  * 单一设计循环的最大轮次：起草→评审→提取→图校验 都在这一个循环里，
//  * 任何一环失败都回喂起草对话重出蓝图。
//  */
export const MAX_DESIGN_ROUNDS = 6;

export const StepNames = {
    dag: 'dag',
    /** PlanContext 整体状态 blob 的落盘名 */
    state: 'state',
} as const;
// export const StatusNames = {
//     pending: 'pending',
//     running: 'running',
//     done: 'done',
// } as const;
