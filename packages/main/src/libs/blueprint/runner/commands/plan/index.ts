/**
 * ============================================================================
 * 【P-00 · 入口调度(多 pass 编译版)】(附 BACKGROUND.md)
 * ============================================================================
 * 对外唯一入口 runCmd:解析参数 → 前端(需求文档生成+规范化落盘,建根,装配
 * PlanContext) → passLoop 多 pass 归约(直至 done/impossible) → 汇报。
 * 本文件只做调度与汇报,无业务逻辑。
 */
import type { IRunnerContext } from '$types/blueprint/context.js';
import { passLoop } from './loop.js';
import { loadCapability } from './steps/retrieve.js';

/** 对外唯一入口:一句话目标 → 可被本平台执行的工作流(代码作骨,LLM 填肉) */
export async function runCmd(ctx: IRunnerContext): Promise<void> {
    const { cap, pctx } = await loadCapability(ctx);
    await passLoop(cap, pctx);
}