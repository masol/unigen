import { IRunnerContext } from "$types/blueprint/context.js";
import { isNumber } from "radashi";

/**
 * ============================================================================
 * 【子任务 P-02 · 常量配置】(附 BACKGROUND.md)
 * ============================================================================
 * 职责:全模块唯一的"改数字的地方"。所有阈值/上限集中于此,其它文件禁止写魔法数。
 * 本文件已完成,后续子任务只允许"新增"常量,不允许改语义。
 */
export const MAX_LAYER_NODES = 7;       // 单层最大节点数(分层批量展开的核心约束)
export const MAX_DEPTH = 5;             // 递归展开最大深度
export const DEF_REFINE_ROUNDS = 2;     // Prism 精炼轮上限(二值门+回退)
export const MAX_LAYER_RETRY = 3;       // 层被接口闸门拒绝后的重生成上限
export const MAX_ITERATIONS = 100;      // 主循环轮次熔断
export const PRESCREEN_THRESHOLD = 0.62;// 术语相似度预筛:高于才调 LLM 对齐复核
export const ALIGN_CONF_THRESHOLD = 0.75;// 对齐置信度:低于不自动合并,标 needsReview
export const CRITIQUE_CONCURRENCY = 8;  // 棱面批判并发数
export const KV_ROOT_KEY = 'app_root_capability'; // KV-store 根能力固定 key
export const MISSING_MARK = '[[MISS]]'; // 哨兵:某节缺失时 LLM 原样写入,代码据此抛错 
export const NO_ISSUE_MARK = '[[PASS]]'; // 哨兵:棱面无问题,代码据此提前跳出收敛循环
export const FORM_TEXT = '[[text]]';
export const FORM_BINARY = '[[binary]]';
export const FORM_OTHER = '[[other]]';
export const WORKFLOW_PREFIX = '#workflow';
export const NODE_PENDING = 'node::pending';
export const WORKFLOW_PENDING = "pending";
export const WORKFLOW_STEP2 = "step2"; // 设计顶层文本层。
export const WORKFLOW_IMPOSSIBLE = "impossible";

// ———— 多 pass 编译骨架新增(只增不改;WORKFLOW_STEP2 遗留不再使用) ————
/** #plan:: 状态编码"下一个待执行的 pass":
 *  pending → chain → (node::pending) → codegen → done / impossible */
export const PASS_CHAIN = 'chain';       // Pass2: 反向链路降级
export const PASS_CODEGEN = 'codegen';   // Pass3: 叶子发码
export const PASS_DONE = 'done';
/** KV 落盘后缀(键 = _#${capId}_${suffix},见 PlanContext.kvKey) */
export const KV_REQUIREMENT = 'requirement';           // 需求文档:原话+五节结构稿
export const KV_DELIVERABLE_SPEC = 'deliverable_spec'; // 交付物字段级 spec(含 form)
export const KV_TOOLS = 'tools';                       // 已解析工具(含 assumed 标记)
export const KV_TRACE = 'trace';                       // 追加式留痕
export const TOOL_SEARCH_LIMIT = 8;
export const MAX_NODE_RETRY = 2; // 生成工作流内:单节点被 PlanViolation 回溯重答上限

export function getRefineRounds(ctx: IRunnerContext): number {
    const args = ctx.cmd.args ?? {};

    if (args['rounds']) {
        const round = parseInt(args['rounds'])
        if (isNumber(round) && round > 0) {
            return round;
        }
    }
    return DEF_REFINE_ROUNDS;
}