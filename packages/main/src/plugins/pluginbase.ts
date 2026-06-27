import type { ILanceDB } from "$libs/project/controllers/lance/type.js";
import type { IProjectPlugin } from "$libs/project/plugin.js";
import { IProjectContext } from "$libs/project/type.js";

export abstract class PluginBase implements IProjectPlugin {
    async dispose(): Promise<void> {

    }

    abstract initLanceTables(lanceDB: ILanceDB, prj: IProjectContext): Promise<void>;

}