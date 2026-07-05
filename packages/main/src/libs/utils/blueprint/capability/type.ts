import type { IRunnerContext } from "$types/blueprint/context.js";


export interface ICapaFunctor {
    run(ctx: IRunnerContext): Promise<void>;
}