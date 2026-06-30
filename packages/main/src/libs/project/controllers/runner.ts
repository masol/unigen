import { RunnerContext } from "$libs/utils/blueprint/context.js";
import { CapaRunner } from "$libs/utils/blueprint/runer.js";
import { throwPrecondition } from "$libs/utils/err.js";
import type { RunState } from "$types/index.js";
import { ProjectDbKeys } from "../dbkeys.js";
import type { IProjectContext } from "../type.js";
import { BaseProjectController } from "./base.js";
import { PrjDB } from "./drizzle/index.js";




export class PrjRunner extends BaseProjectController {
    #runner: CapaRunner;

    constructor(ctx: IProjectContext) {
        super(ctx)
        this.#runner = new CapaRunner();
    }
    static ensure(ctx: IProjectContext): PrjRunner { return this.coreEnsure(this, ctx); }

    get runState(): RunState {
        return this.#runner ? this.#runner.state : 'idle';
    }

    get startTime(): number {
        return this.#runner ? this.#runner.startTime : 0;
    }

    async waitFinish(): Promise<void> {
        return this.#runner.waitFinish();
    }

    start(entry?: string): void {
        const prjdb = PrjDB.ensure(this.ctx);
        if (!entry) {
            const defEntry = prjdb.get<string>(ProjectDbKeys.entry_capa);
            if (!defEntry) {
                throwPrecondition("项目未指定默认启动的能力ID，也没有给出能力ID.")
            }
            entry = defEntry;
        }

        const ctx = new RunnerContext(this.ctx);
        this.#runner.start(entry, ctx);
    }

    stop(bForce: boolean): void {
        this.#runner.stop(bForce);
    }
}