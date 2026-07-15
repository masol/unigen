/**
 * ============================================================================
 * 目录：src/extract —— 目标提取器（Goal Extraction / Input Gate）
 * ============================================================================
 * 【子任务】系统入口闸门。主文件只收「用户一句话」，本目录提取成结构合法的规划输入
 * （goal + 可选输入/输出线索）。**不能合法提取就直接报错返回**，不进入后续昂贵流程。
 * 理由：主文件「只调度不写逻辑」，「这句话能否被规划」的判断必须收敛在此，fail-fast。
 *
 * 【职责边界】
 * - 输入 raw:string（隐含「输入→输出」意图，如「从剧本到视频」）。
 * - 输出 discriminated union（绝不抛异常穿透到主文件，主文件靠 ok 分流）：
 *     ExtractOk  = {ok:true, goal:ExtractedGoal}
 *     ExtractErr = {ok:false, reason:string, code:ExtractErrorCode}
 * - ExtractedGoal = {rawText, goal(归一化,喂P4), inputHint?, outputHint?}
 *
 * 【何时返回 ExtractErr】
 * - 空串/纯噪声/无产出意图 → 'NO_GOAL'
 * - 过于开放模糊、缺可规划结构 → 'TOO_VAGUE'（呼应 §3：本路线不适合开放泛化任务，
 *   宁可入口诚实拒绝，也不硬塞重流程）
 * - 提取本身失败且无法降级 → 'EXTRACT_FAILED'
 *
 * 【实现要求】
 * - 分两层：先廉价规则/启发式(长度、是否含动作意图)快速判空；确有必要再调一次
 *   受约束 generateObject(zod) 做结构化提取。避免为一句话就上重模型。
 * - 只判「可否作为目标」并抽种子字段，**不做任务拆解**（那是 planner 的事）。
 * - 所有路径埋 OTel span。导出 extractGoal(raw): Promise<ExtractResult>。
 */
/**
 * 入口闸门（§3）。不能合法提取 → 报错返回，不进入昂贵流程。
 * v1：规则判定；真实版走 generateObject(zod)。
 */
import { llmLooksLikeGoal } from './llm.js';
import type { ExtractResult } from './types.js';

export async function extractGoal(raw: string): Promise<ExtractResult> {

    if (!raw || !raw.trim()) return { ok: false, code: 'NO_GOAL', reason: '空输入' };
    if (!llmLooksLikeGoal(raw)) return { ok: false, code: 'TOO_VAGUE', reason: '无法识别可规划目标' };
    // 「输入→输出」意图的极简抽取（真实版由 LLM 结构化产出）
    const m = raw.match(/从(.+?)到(.+)/);
    return {
        ok: true,
        goal: { rawText: raw, goal: raw.trim(), inputHint: m?.[1]?.trim(), outputHint: m?.[2]?.trim() },
    };
}
