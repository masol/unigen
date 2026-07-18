/**
 * ============================================================================
 * 【P-03 · Pass0 前端:需求锚定 + 落盘 + 上下文装配】(附 BACKGROUND.md)
 * ============================================================================
 * 三条路径统一收敛为 { cap, pctx }:
 *  - --cap new : 五节稿锚定 → 建根 → 需求文档规范化落盘 KV → 登记 entry;
 *  - --cap uuid: 载入既有能力(需求文档应已在 KV,缺失则告警降级);
 *  - 无参      : 从 entry_capa 续跑。
 * 自此所有 pass 以 KV 中的需求文档为唯一需求真相源,不再回读用户原话。
 */
import { makePlanDesc } from '$libs/blueprint/capability/is.js';
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { ProjectDbKeys } from '$libs/utils/db/dbkeys.js';
import { throwUnprcessable } from '$libs/utils/err.js';
import { Capability } from '$types/blueprint/capability.js';
import { IRunnerContext } from '$types/blueprint/context.js';
import Logger from 'electron-log/main.js';
import validator from 'validator';
import { KV_REQUIREMENT, WORKFLOW_PENDING } from '../config.js';
import { PlanContext } from '../context.js';
import type { AnchorOut, TermType } from '../prompts/anchor.js';
import { extractRequirement } from './anchor.js';

function upcertMetags(prjdb: PrjDB, term: TermType): void {
    // @TODO: 对齐与搜索现有 metag(相似度预筛 + LLM 复核,低置信标 needsReview)
    prjdb.upcertMetag({ fieldKey: term.name, intent: term.intent });
}

function createCaps(prjdb: PrjDB, reqCap: AnchorOut): Capability {
    reqCap.inputs.forEach((i) => upcertMetags(prjdb, i));
    reqCap.outputs.forEach((i) => upcertMetags(prjdb, i));

    const capId = prjdb.upcertCapa({
        name: makePlanDesc(WORKFLOW_PENDING),
        input: reqCap.inputs.map((i) => i.name),
        output: reqCap.outputs.map((i) => i.name),
        goal: reqCap.goal,
        criteria: reqCap.criteria.join('\n'),
        negative: reqCap.negative.join('\n'),
    });
    const cap = prjdb.getCapaById(capId);
    if (!cap) {
        const msg = '未能成功保存cap:' + JSON.stringify(reqCap, null, 2);
        Logger.error(msg);
        throwUnprcessable(msg);
    }
    Logger.info(`新建待规划能力:${cap.id}。目标:${cap.goal},输入:${cap.input},输出:${cap.output}`);
    return cap;
}

export async function loadCapability(
    ctx: IRunnerContext,
): Promise<{ cap: Capability; pctx: PlanContext }> {
    const args = ctx.cmd.args ?? {};
    const body = (ctx.cmd.body ?? '').trim();
    const prjdb: PrjDB = PrjDB.ensure(ctx.prj);

    let cap: Capability | null = null;

    if (args.cap === 'new') {
        Logger.info('[plan] 开始规划', { body, args });
        ctx.notify('确定需求', body);

        // ---- Pass0:五节稿锚定(不可规划时 extractRequirement 内部 throw) ----
        const requirement = await extractRequirement(body, ctx);
        cap = createCaps(prjdb, requirement);

        const pctx = new PlanContext(ctx, prjdb, cap.id);

        // ---- 需求文档规范化落盘:原话 + 结构稿,唯一需求真相源 ----
        pctx.kvSet(cap.id, KV_REQUIREMENT, {
            body,
            requirement,
            savedAt: new Date().toISOString(),
        });
        pctx.trace(cap.id, 'requirement', '需求文档已锚定并落盘', requirement);

        // ---- 登记入口:任意中断后无参重跑即可续跑 ----
        prjdb.set(ProjectDbKeys.entry_capa, cap.id);
        return { cap, pctx };
    }

    if (args.cap) {
        if (!validator.isUUID(args.cap)) {
            throwUnprcessable('cap参数必须是合法的UUID或new');
        }
        cap = prjdb.getCapaById(args.cap);
    } else {
        const entry = prjdb.get<string>(ProjectDbKeys.entry_capa);
        if (entry) cap = prjdb.getCapaById(entry);
    }

    if (!cap) {
        throwUnprcessable(`无法加载${args.cap}指定的能力。`);
    }

    const pctx = new PlanContext(ctx, prjdb, cap.id);
    if (!pctx.kvGet(cap.id, KV_REQUIREMENT)) {
        Logger.warn(`[plan] ${cap.id} 缺少 KV 需求文档,降级以 goal/criteria 为准`);
    }
    return { cap, pctx };
}