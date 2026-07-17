/**
 * ============================================================================
 * 【P-00 · 入口调度】(附 BACKGROUND.md)
 * ============================================================================
 * 对外唯一入口 runCmd:解析参数 → 锚定新目标(建根) → 主循环逐层规划 → 汇报。
 * 本文件只做调度与汇报,无业务逻辑。--cap 续跑路径本版不实现(留桩)。
 */
import type { IRunnerContext } from '$types/blueprint/context.js';
import Logger from 'electron-log/main.js';
import { planLoop } from './loop.js';
import { loadCapability } from './steps/retrieve.js';

/** 对外唯一入口:一句话目标 → 完整分层工作流 */
export async function runCmd(ctx: IRunnerContext): Promise<void> {


    const cap = await loadCapability(ctx);

    await planLoop(cap, ctx);

    return;

    // ---- 主循环:逐层规划直到收敛(库即黑板,内部可断点续跑) ----
    const result = await planLoop(targetCap, ctx);

    // ---- 汇报 ----
    if (result.ok) {
        const { layers, caps, terms } = result.stats;
        const msg = `根能力 ${result.rootCapId}\n层数 ${layers} | 能力 ${caps} | 术语 ${terms}`;
        Logger.info(`[plan] 规划完成\n${msg}`);
        ctx.notify('规划完成 ✅', msg);
        return;
    }

    // 诚实失败:断点在哪、为何失败,逐条报出
    const detail = result.blocked
        .map((b) => `- [${b.capId}] ${b.goal}\n  原因: ${b.reason}`)
        .join('\n');
    Logger.warn(`[plan] 规划未收敛\n${detail}`);
    ctx.notify('规划未完成 ⚠️', `以下能力无法展开:\n${detail}`);
}