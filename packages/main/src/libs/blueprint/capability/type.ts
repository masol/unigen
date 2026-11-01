import type { IRunnerContext } from "$types/blueprint/context.js";


export interface ICapaFunctor {
    readonly id: string;
    run(ctx: IRunnerContext): Promise<void>;
}