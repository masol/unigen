import type { Capability } from "$types/blueprint/capability.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { BaseFunctor } from "../base.js";


export abstract class InterBase extends BaseFunctor {

    constructor(readonly capa: Capability) {
        super(capa);
    }
    abstract runImpl(ctx: IRunnerContext, input: unknown[]): Promise<unknown>;
}