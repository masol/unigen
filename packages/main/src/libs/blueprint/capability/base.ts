import { throwPrecondition } from "$libs/utils/err.js";
import type { Capability, NewCapability } from "$types/blueprint/capability.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { fullInternalName, getInternalName } from "./is.js";
import type { CapaRunInput, ICapaFunctor } from "./type.js";

export function fillCapa(capa: NewCapability): Capability {
    const name = getInternalName(capa?.name) ?? capa?.name
    if (!name) {
        throwPrecondition("fillCapa只支持内存填充internal functor。")
    }
    const realName = fullInternalName(name);
    return {
        id: capa.id ?? crypto.randomUUID(),
        role: "",
        goal: '',
        code: "",
        input: [],
        output: [],
        process: '',
        negative: '',
        criteria: '',
        fewshot: [],
        createdAt: '',
        updatedAt: '',
        ...capa,
        name: realName,
        ...capa
    }
}

export abstract class BaseFunctor implements ICapaFunctor {

    get id() {
        return this.capa.name;
    }

    constructor(readonly capa: Capability) { }

    // 由 run 实现方主动调用基类的 getInput / saveOutput 方法来获取输入和保存输出。
    // 返回值需表示本次运行的"最终 message"，无内容时返回 ""。
    protected abstract doTask(
        ctx: IRunnerContext,
        input?: CapaRunInput,
    ): Promise<string>;

    async run(ctx: IRunnerContext, input?: CapaRunInput): Promise<string> {
        if (ctx.isAborted) {
            return "";
        }
        return await this.doTask(ctx, input);
    }
}