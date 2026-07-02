
import { Capability } from "$types/blueprint/capability.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { ICapaFunctor } from "./type.js";

export abstract class BaseFunctor implements ICapaFunctor {

    constructor(readonly capa: Capability) { }
    // 由run实现方主动调用基类的getInput/saveOutput方法来获取输入和保存输出。
    abstract run(ctx: IRunnerContext): Promise<void>;
}