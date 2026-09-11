// run.ts
import { throwUnprcessable } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { agentsManager } from "./agents/manager.js";
import { createCommonContext } from "./context.js";

export async function run(ctx: IRunnerContext): Promise<void> {
    // Logger.debug("response to cmd", ctx.cmd?.body)
    if (!ctx.cmd?.body) {
        throwUnprcessable("本次进入目标循环，但是未指定任意新的内容。")
    }

    await agentsManager.registerAll();

    const cctx = createCommonContext(ctx);

    const result = await agentsManager.runAgent("target", cctx);

    cctx.ctx.notify('', result ?? '');

    agentsManager.clear();

    ctx.notify("完成", "助手完成主循环。");
}