import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { ProjectDbKeys } from "$libs/utils/db/dbkeys.js";
import { throwNotfound, throwUnprcessable } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { GDagJSON } from "$types/index.js";
import validator from 'validator';

export async function runCmd(ctx: IRunnerContext): Promise<void> {
    const prjdb = PrjDB.ensure(ctx.prj);
    const args = ctx.cmd.args || {};
    let id = "";
    if (validator.isUUID(args.plan)) {
        const dag = prjdb.get<{ gdag?: GDagJSON }>(`.${args.plan}_state`);
        id = dag?.gdag?.rootId ?? ""
        ctx.debug("[run] run args.plan with id ", id)
        if (!id) {
            throwUnprcessable(`请求的执行规划${args.plan},但是获取其rootId失败。`)
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

    await functor.run(ctx);

    // ctx.notify("", result.text);
}