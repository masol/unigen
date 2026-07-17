/**
 * ============================================================================
 * 【P-00 · 入口调度】(附 BACKGROUND.md)
 * ============================================================================
 * 对外唯一入口 runCmd:解析参数 → 锚定新目标(建根) → 主循环逐层规划 → 汇报。
 * 本文件只做调度与汇报,无业务逻辑。--cap 续跑路径本版不实现(留桩)。
 */
import type { IRunnerContext } from '$types/blueprint/context.js';
import { planLoop } from './loop.js';
import { loadCapability } from './steps/retrieve.js';

/** 对外唯一入口:一句话目标 → 完整分层工作流 */
export async function runCmd(ctx: IRunnerContext): Promise<void> {


    const cap = await loadCapability(ctx);

    await planLoop(cap, ctx);

    return;

}