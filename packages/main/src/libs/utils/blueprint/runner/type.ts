import type { IRunnerContext } from "$types/blueprint/context.js";


export interface ICapaRunner {
    run(ctx: IRunnerContext): Promise<void>;
}