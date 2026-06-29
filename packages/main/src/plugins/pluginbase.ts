import type { ILanceDB } from "$libs/project/controllers/lance/type.js";
import type { IProjectPlugin } from "$libs/project/plugin.js";
import { RunState } from "$types/index.js";

export abstract class PluginBase implements IProjectPlugin {
    abstract readonly runState: RunState;
    abstract readonly startTime: number;
    async dispose(): Promise<void> {
    }
    abstract initLanceTables(lanceDB: ILanceDB): Promise<void>;
    abstract start(): void;
    abstract stop(bForce: boolean): void;
    abstract waitFinish(): Promise<void>;
}