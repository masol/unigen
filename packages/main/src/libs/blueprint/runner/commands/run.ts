import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { ProjectDbKeys } from "$libs/utils/db/dbkeys.js";
import { throwNotfound, throwUnprocessable } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { GDagJSON } from "$types/index.js";
import validator from 'validator';

export async function runCmd(ctx: IRunnerContext): Promise<string> {
    const prjdb = PrjDB.ensure(ctx.prj);
    const args = ctx.cmd.args || {};
    let id = "";
    if (validator.isUUID(args.plan)) {
        const dag = prjdb.get<{ gdag?: GDagJSON }>(`.${args.plan}_state`);
        id = dag?.gdag?.rootId ?? ""
        ctx.debug("[run] run args.plan with id ", id)
        if (!id) {
            throwUnprocessable(`请求的执行规划${args.plan},但是获取其rootId失败。`)
        }
    } else if (validator.isUUID(args.cap)) {
        id = args.cap
    }
    if (!id) {
        id = prjdb.get<string>(ProjectDbKeys.entry_capa) ?? "";
    }

    if (!id) {
        throwNotfound("无法获取入口ID,请使用--cap=ID或--plan=ID来指定入口。")
    }

    const functor = ctx.loadFunctor(id)

    if (!functor) {
        throwNotfound(`无法加载${id}对应的执行能力。`)
    }

    // 返回该能力的最终 message，交由 dispatchCmds / CmdRunner 沿调用链透出。
    // 不在此处额外 notify：用户直跑 `/run` 时由被调能力自身的通知通路负责展示。
    return await functor.run(ctx);
}