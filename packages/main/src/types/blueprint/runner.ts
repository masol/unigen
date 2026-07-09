import type { IRunnerContext } from "./context.js";

export interface ICapaRunner {
    run(capaId: string, ctx: IRunnerContext): Promise<void>;
}
