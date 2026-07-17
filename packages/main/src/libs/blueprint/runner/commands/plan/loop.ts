/**
 * ============================================================================
 * 【P-05 · 主循环(reconcile)】(附 BACKGROUND.md)
 * ============================================================================
 * 库即黑板的"查询-处理-回写"循环。每轮从库中选一个 draft 能力:
 * 守门 → 展开(Prism) → 闸门+落库(被拒带原因回炉) → 复杂度判定。
 * 无内存队列;任意时刻中断,重跑本函数从库中状态无损续跑。
 */
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import { Capability } from '$types/blueprint/capability.js';
import type { IRunnerContext } from '$types/blueprint/context.js';
import { realizeStep } from './steps/realize.js';

export async function planLoop(rootCap: Capability, ctx: IRunnerContext) {
    //首先检查
    const prjdb = PrjDB.ensure(ctx.prj);
    const metag = prjdb.getMetag(rootCap.output)[0];
    if (!metag) {
        throwUnprcessable("未定位输出。")
    }
    await realizeStep({
        target: {
            name: metag?.fieldKey,
            intent: metag?.intent ?? ""
        },
        goal: rootCap.goal,
        criteria: rootCap.criteria.split("\n"),
        availablePrograms: "",
        availableTexts: "",
        ctx
    });
}

// export async function planLoop(
//     rootCapId: string,
//     ctx: IRunnerContext,
// ): Promise<LoopResult> {
//     const tag = '[plan:loop]';

//     for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
//         // ================================================================
//         // 1) 选取:根子树内 status='draft',按 depth ASC(浅层优先)取 1 个
//         //    —— 图查询代替队列,库即黑板
//         // ================================================================
//         const drafts = await findExpandable(rootCapId);

//         // ---- 终局判定:无 draft → 全局校验交付 or 汇总 blocked ----
//         if (drafts.length === 0) {
//             const stats = await subtreeStats(rootCapId);
//             if (stats.blocked > 0) {
//                 const blocked = await listBlocked(rootCapId);
//                 Logger.warn(`${tag} 收敛但存在 ${stats.blocked} 个 blocked 节点`);
//                 return {
//                     ok: false,
//                     rootCapId,
//                     blocked: blocked.map((b) => ({
//                         capId: b.id, goal: b.goal, reason: b.blockReason,
//                     })),
//                 };
//             }
//             // 全部触底且无阻塞 → 终检(纯代码):叶子皆 atomic/fieldKey 无悬空/
//             // DAG 重放/chunk 终检,过则登记 KV 并返回统计
//             Logger.info(`${tag} 无剩余 draft,进入全局校验`);
//             return verifyAndDeliver(rootCapId);
//         }

//         const cap = drafts[0];
//         Logger.info(`${tag} 轮次 ${iter}/${MAX_ITERATIONS} | 处理 ${cap.id} (depth=${cap.depth}) | 剩余 draft=${drafts.length}`);
//         ctx.notify(`规划中 ${iter}`, `${cap.goal} (深度${cap.depth}, 待处理${drafts.length})`);

//         // ================================================================
//         // 2) 递归守门(纯代码,先于一切 LLM 调用):深度上限 + 祖先 goal 重复
//         // ================================================================
//         const ancestors = await ancestorsOf(cap.id);
//         const guard = checkRecursion({
//             goal: cap.goal,
//             depth: cap.depth,
//             maxDepth: args.depth,
//             ancestorGoals: ancestors.map((a) => ({ capId: a.id, goal: a.goal })),
//         });
//         if (!guard.ok) {
//             Logger.warn(`${tag} 守门拦截 ${cap.id}: ${guard.reasons.join('; ')}`);
//             await setStatus(cap.id, 'blocked', `recursion_guard: ${guard.reasons.join('; ')}`);
//             continue; // blocked 不再展开,终局判定时汇总上报
//         }

//         // ================================================================
//         // 3) 展开 + 闸门落库:被拒则带原因回炉,最多 args.retry 次
//         //    (s2 产层稿[Prism 收敛] → s3 先闸门[接口铁律+DAG]后事务落库)
//         // ================================================================
//         let capIds: string[] | null = null;
//         let rejectReasons: string[] | undefined;

//         for (let attempt = 0; attempt <= args.retry; attempt++) {
//             if (attempt > 0) {
//                 Logger.info(`${tag} ${cap.id} 第 ${attempt} 次回炉,原因: ${rejectReasons?.join('; ')}`);
//             }

//             // ▶ LLM【单层展开:1 草稿 + 5 棱面并发批判 + ≤rounds 精炼】→ LayerPlan
//             const plan = await expandLayer({
//                 parentCapId: cap.id,
//                 args,
//                 rejectReasons, // 回炉时注入上次闸门拒绝原因,要求换思路
//                 ctx,
//             });

//             // 闸门(纯代码) + 事务落库;闸门拒绝时库无任何变更
//             const persisted = await persistLayer({ plan, args, ctx });
//             if (persisted.ok) {
//                 capIds = persisted.capIds ?? [];
//                 break;
//             }
//             rejectReasons = persisted.reasons;
//         }

//         if (!capIds) {
//             // 重试耗尽仍被闸门拒绝 → 诚实标 blocked,留最后一次拒绝原因
//             Logger.warn(`${tag} ${cap.id} 重试耗尽(${args.retry}),标 blocked`);
//             await setStatus(cap.id, 'blocked', `layer_rejected: ${rejectReasons?.join('; ') ?? 'unknown'}`);
//             continue;
//         }
//         // 此时 s3 已将父能力置 status='planned',子能力皆 status='draft'

//         // ================================================================
//         // 4) 复杂度判定(本层子能力并发):atomic → 触底;否则保持 draft 待下轮
//         // ================================================================
//         // ▶ LLM【复杂度判定 ×N 并发,已有能力高相似则代码速判免调】
//         const verdicts = await judgeComplexity(capIds, ctx);
//         let atomicCount = 0;
//         for (const [, v] of verdicts) if (v.atomic) atomicCount++;
//         Logger.info(`${tag} ${cap.id} 展开完成: 子能力 ${capIds.length} 个,其中 atomic ${atomicCount} 个`);
//         // (judgeComplexity 内部已完成 setStatus('atomic')/chunk 修正/planTrace 记录)
//     }

//     // ================================================================
//     // 轮次熔断:未收敛,诚实报告而非硬撑
//     // ================================================================
//     Logger.warn(`${tag} 达到轮次上限 ${MAX_ITERATIONS},未收敛`);
//     await setStatus(rootCapId, 'blocked', `max_iterations(${MAX_ITERATIONS})`);
//     const blocked = await listBlocked(rootCapId);
//     return {
//         ok: false,
//         rootCapId,
//         blocked: blocked.map((b) => ({ capId: b.id, goal: b.goal, reason: b.blockReason })),
//     };
// }