import type { ILanceDB } from "./controllers/lance/type.js";
import type { IProjectContext } from "./type.js";

export interface IProjectPlugin {
    dispose(): Promise<void>;
    initLanceTables(lanceDB: ILanceDB, prj: IProjectContext): Promise<void>
}