import { RunState } from "$types/index.js";
import type { ILanceDB } from "./controllers/lance/type.js";

export interface IProjectPlugin {
    readonly runState: RunState;
    readonly startTime: number;
    dispose(): Promise<void>;
    initLanceTables(lanceDB: ILanceDB): Promise<void>;
    start(): void;
    stop(bForce: boolean): void;
    waitFinish(): Promise<void>;
}