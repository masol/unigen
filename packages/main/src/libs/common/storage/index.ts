import { getInput } from "$libs/blueprint/glossary/input.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { IRunnerContext } from "$types/blueprint/context.js";
import { ConfigStorage } from "./config.js";
import { GoalStorage } from "./goal.js";
import { TasksStorage } from "./tasks.js";

export class ICommonStorage {

    readonly config: ConfigStorage;
    readonly goal: GoalStorage;
    private readonly tasks: Map<string, TasksStorage> = new Map();

    constructor(private readonly ctx: IRunnerContext) {
        const prjdb = PrjDB.ensure(ctx.prj);
        this.config = new ConfigStorage(prjdb);
        this.goal = new GoalStorage(prjdb);
    }

    ensureTasksStorage(taskId: string = "<root>"): TasksStorage {
        if (!this.tasks.has(taskId)) {
            const prjdb = PrjDB.ensure(this.ctx.prj);
            this.tasks.set(taskId, new TasksStorage(prjdb, taskId));
        }
        return this.tasks.get(taskId)!;
    }

    getInputDocs(): string[] {
        return getInput(this.ctx, "script");
    }
}