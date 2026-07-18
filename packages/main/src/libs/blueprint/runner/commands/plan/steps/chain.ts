/**
 * ============================================================================
 * 【P-07 · Pass2:反向链路降级】
 * ============================================================================
 * 读 Pass1 落盘的 spec(不再重复 FORM 判定):
 *  - text   → 本能力即 LLM 强调用节点,直接推进 codegen(COMPOSE 递归拆解留桩);
 *  - binary → realizeChain 反推程序链 → DAG 挂回本能力(name=#workflow);
 *             工具步子能力=node::pending,外部文本输入子能力=pending(回 Pass1 递归)。
 */
import { makePlanDesc } from '$libs/blueprint/capability/is.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import { Capability } from '$types/blueprint/capability.js';
import {
    KV_DELIVERABLE_SPEC, KV_TOOLS, PASS_CODEGEN, WORKFLOW_IMPOSSIBLE,
} from '../config.js';
import { PlanContext, ResolvedTool } from '../context.js';
import type { SpecOut } from '../prompts/spec.js';
import { realizeChain } from './realize.js';

export async function passChain(cap: Capability, pctx: PlanContext): Promise<void> {
    const saved = pctx.kvGet<{ form: string; spec: SpecOut }>(cap.id, KV_DELIVERABLE_SPEC);
    if (!saved) throwUnprcessable(`缺少 Pass1 spec,不可降级:${cap.id}`);
    const metag = pctx.prjdb.getMetag(cap.output)[0];
    const target = { name: metag.fieldKey, intent: metag.intent ?? '' };

    if (saved.form === 'text') {
        // 文本交付物 = LLM 强调用节点。@TODO: 超过单次上下文体量时 COMPOSE 拆解递归
        cap.name = makePlanDesc(PASS_CODEGEN);
        pctx.prjdb.upcertCapa(cap);
        pctx.trace(cap.id, 'chain', 'text 交付物,转 LLM 强调用节点');
        return;
    }

    // binary:工具清单已由 Pass1 落盘,注入提示词(LLM 不检索)
    const tools = pctx.kvGet<ResolvedTool[]>(cap.id, KV_TOOLS) ?? [];
    const result = await realizeChain({
        cap, target,
        goal: cap.goal,
        criteria: cap.criteria.split('\n'),
        spec: saved.spec,
        tools,
        pctx,
    });

    if (result.kind === 'impossible') {
        cap.name = makePlanDesc(WORKFLOW_IMPOSSIBLE);
        pctx.prjdb.upcertCapa(cap);
        pctx.trace(cap.id, 'chain', `impossible: ${result.reason}`);
    }
    // kind === 'dag':realizeChain 内已把 DAG 挂回 cap 本体并建好子能力,无需处理
}