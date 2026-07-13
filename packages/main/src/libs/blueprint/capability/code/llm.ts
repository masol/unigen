import { getSmartModel } from "$libs/model/index.js";
import { NL2Format } from "$libs/model/llm/outline.js";
import { LlmParamArgs } from "$types/ai/gentext.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { generateText, Output } from "ai";


// 透传ctx,以允许abort生效。
const generate = async (ctx: IRunnerContext, args: LlmParamArgs) => {
    const { model, ...rest } = args;


    const result = await generateText({
        model: getSmartModel(model, ctx),
        ...rest
    });
    return result;
}


const nl2fmt = async (ctx: IRunnerContext, args: LlmParamArgs) => {
    const { model, ...rest } = args;
    const result = await NL2Format({
        model: getSmartModel(model, ctx),
        ...rest
    });
    return result;
}

const fixed = {
    Output
}

export function getLLMPkgs(ctx: IRunnerContext) {
    return {
        ...fixed,
        generate: generate.bind(null, ctx),
        nL2Format: nl2fmt.bind(null, ctx),
    } as const
};
