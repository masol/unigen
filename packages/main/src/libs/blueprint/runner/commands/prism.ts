import { prism, PrismOpts } from "$libs/model/llm/prism/prism.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";


export async function runCmd(ctx: IRunnerContext): Promise<void> {
    const body = ctx.cmd.body;
    if (!body) {
        throwUnprcessable("请求prism，但是未提供任何问题。")
    }
    ctx.notify("裸调用中", "获取初始草稿中...");
    const opts: PrismOpts = {};
    const args = ctx.cmd.args ?? {};

    if (args['facets']) {
        opts.maxFacets = parseInt(args['facets'])
    }
    if (args['rounds']) {
        opts.maxRefineRounds = parseInt(args['rounds'])
    }
    if (args['kind']) {
        opts.kind = args.kind
    }

    const result = await prism(body, opts, ctx)
    ctx.notify("", result.text);
}