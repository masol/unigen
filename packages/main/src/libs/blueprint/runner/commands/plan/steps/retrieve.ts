import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { ProjectDbKeys } from "$libs/utils/db/dbkeys.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { Capability } from "$types/blueprint/capability.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import validator from "validator";
import type { AnchorOut, TermType } from "../prompts/anchor.js";
import { extractRequirement } from "./anchor.js";

function upcertMetags(prjdb: PrjDB, term: TermType): void {
    // @TODO: 对齐与搜索现有metag。
    prjdb.upcertMetag({
        fieldKey: term.name,
        intent: term.intent
    })
}

async function createCaps(ctx: IRunnerContext, reqCap: AnchorOut): Promise<Capability> {
    // 这里未做对齐，@todo: 需要对capa中的metag以及cap做对齐。
    const prjdb = PrjDB.ensure(ctx.prj);

    reqCap.inputs.forEach((i) => {
        upcertMetags(prjdb, i);
    })
    reqCap.outputs.forEach((i) => {
        upcertMetags(prjdb, i);
    })

    const capId = prjdb.upcertCapa({
        name: "#plan::pending",
        input: reqCap.inputs.map(i => i.name),
        output: reqCap.outputs.map(i => i.name),
        goal: reqCap.goal,
        criteria: reqCap.criteria.join('\n'),
        negative: reqCap.negative.join('\n')
    });
    const cap = prjdb.getCapaById(capId);
    if (!cap) {
        const msg = "未能成功保存cap:" + JSON.stringify(reqCap, null, 2)
        Logger.error(msg)
        throwUnprcessable(msg)
    }

    Logger.info(`新建了待规划能力：${cap.id}。目标：${cap.goal},输入：${cap.input},输出:${cap.output}`)
    return cap;
}

export async function loadCapability(ctx: IRunnerContext): Promise<Capability> {
    const args = ctx.cmd.args ?? {};
    const body = (ctx.cmd.body ?? '').trim();

    let cap: Capability | null = null;
    const prjdb: PrjDB = PrjDB.ensure(ctx.prj);
    if (args.cap === 'new') {

        Logger.info('[plan] 开始规划', { body, args });
        ctx.notify('确定需求', body);

        // ---- Step1:目标锚定,建根能力(不可规划时 anchorGoal 内部 throwUnprcessable) ----
        const targetCap = await extractRequirement(body, ctx);
        Logger.info(`[plan] 根能力已建立: (${JSON.stringify(targetCap, null, 2)})`);

        cap = await createCaps(ctx, targetCap);
    } else if (args.cap) {
        if (!validator.isUUID(args.cap)) {
            throwUnprcessable("cap参数必须是合法的UUID或new")
        }
        cap = prjdb.getCapaById(args.cap);
    } else {
        const entry = prjdb.get<string>(ProjectDbKeys.entry_capa);
        if (entry) {
            cap = prjdb.getCapaById(entry);
        }
    }

    if (!cap) {
        throwUnprcessable(`无法加载${args.cap}指定的能力。`)
    }

    return cap;
}