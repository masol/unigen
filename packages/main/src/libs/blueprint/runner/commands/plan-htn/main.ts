/**
 * ============================================================================
 * 主文件 main.ts —— 只调度，不写任何实际逻辑
 * ============================================================================
 * 职责：把「用户一句话」串过 extract → (history 参考) → planner → solver，
 * 输出动作序列或错误。所有实际逻辑在各子模块；此处只做编排与错误分流。
 *
 * 流程：
 *   1) extractGoal(oneLiner)：不能合法提取 → 直接报错返回（不进入昂贵流程）。
 *   2) loadPriorWorkflows(goal)：v1 返回 []，仅占位；不影响主流程。
 *   3) planner.run(goal, prior?)：bootstrap → decomposeLoop → compileToHDDL。
 *   4) solver.solve({hddl, initFacts, goal})：v1 走 sim，输出 SolveResult。
 *   5) 汇总返回。
 */
/** 主文件：只调度。extract → (history) → planner → solver。 */
import { throwUnprcessable } from '$libs/utils/err.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import { extractGoal } from './extract.js';
import { loadPriorWorkflows } from './history.js';
import { runPlanner } from './planner.js';
import { solve } from './solver.js';

export async function runCmd(ctx: IRunnerContext) {

    const oneLiner = ctx.cmd.body;
    if (!oneLiner) {
        throwUnprcessable("未给出要求。") //此处返回never.类似throw效果。
    }
    console.log(`\n=== 输入: "${oneLiner}" ===`);

    // 1) 入口闸门
    const ex = await extractGoal(oneLiner);
    if (!ex.ok) { console.error(`\n[FAIL] extract ${ex.code}: ${ex.reason}`); process.exit(1); }
    console.log(`目标: ${ex.goal.goal}  (输入=${ex.goal.inputHint ?? '-'}, 输出=${ex.goal.outputHint ?? '-'})`);

    // 2) 历史（v1 空）
    const prior = await loadPriorWorkflows(ex.goal.goal);

    // 3) 规划
    const { hddl, initFacts, graph } = await runPlanner(ex.goal, prior);
    console.log('\n=== AND-OR 图 ===');
    console.table(graph.dump());
    console.log('\n=== HDDL 域 (tasks) ===');
    for (const t of hddl.tasks) console.log(`(:task ${t.task})  methods=${t.methods.length}:`, t.methods.map((m) => m.subtasks));

    // 4) 解算
    const plan = await solve({ hddl, initFacts, goal: 'video_ready' });
    console.log('\n=== 解算结果 ===');
    console.log('planFound:', plan.planFound);
    console.log('actionSequence:', plan.actionSequence);
    console.log('assumptions:', plan.assumptions);
}
