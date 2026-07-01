import { Capability } from "$types/blueprint/capability.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { InterBase } from "./base.js";


export class SplitFunctor extends InterBase {
    constructor(capa: Capability) {
        super(capa);
        // this.capa = capa;
    }

    async runImpl(_ctx: IRunnerContext, _input: unknown[]): Promise<unknown> {
        return "";
    }
}