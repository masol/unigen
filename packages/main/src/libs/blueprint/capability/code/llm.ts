import { getSmartModel } from "$libs/model/index.js";
import { LlmParamArgs } from "$types/ai/gentext.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { generateText } from "ai";

// 透传ctx,以允许abort生效。
const generate = async (ctx: IRunnerContext, args: LlmParamArgs) => {
    const { model, ...rest } = args;
    return generateText({
        model: getSmartModel(model, ctx),
        ...rest
    });
}

export function getLLMPkgs(ctx: IRunnerContext) {
    return {
        generate: generate.bind(null, ctx)
    } as const
};
