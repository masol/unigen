import { getInput } from "$libs/blueprint/glossary/input.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { ConfigStorage } from "./config.js";
import { GoalStorage } from "./goal.js";

export class ICommonStorage {

    readonly config: ConfigStorage;
    readonly goal: GoalStorage;

    constructor(private readonly ctx: IRunnerContext) {
        const prjdb = PrjDB.ensure(ctx.prj);
        this.config = new ConfigStorage(prjdb);
        this.goal = new GoalStorage(prjdb);
    }

    getInputDocs(): string[] {
        return getInput(this.ctx, "script");
    }
}