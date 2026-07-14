import { preprism, PreprismOpts } from "$libs/model/llm/preprism/index.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import type { IRunnerContext } from "$types/blueprint/context.js";


export async function runCmd(ctx: IRunnerContext): Promise<void> {
    const body = ctx.cmd.body;
    if (!body) {
        throwUnprcessable("请求preprism，但是未提供任何问题。")
    }
    ctx.notify("准备中", "开始Preprism");
    const opts: PreprismOpts = {};
    const args = ctx.cmd.args ?? {};

    if (args['facets']) {
        opts.maxDimensions = parseInt(args['facets'])
    }
    if (args['kind']) {
        opts.kind = args.kind
    }

    const result = await preprism(body, opts, ctx)
    ctx.notify("", result.text);
}