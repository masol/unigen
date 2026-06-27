import { ILanceDB } from "$libs/project/controllers/lance/type.js";
import { IProjectPlugin } from "$libs/project/plugin.js";
import { IProjectContext } from "$libs/project/type.js";
import { PluginBase } from "../pluginbase.js";
import { TableFact } from "./lance/fact.js";


export class Plugin extends PluginBase {
    static type: string = "video";
    static async create(): Promise<IProjectPlugin> {
        return new Plugin();
    }
    async initLanceTables(lanceDB: ILanceDB, prj: IProjectContext): Promise<void> {
        void (prj);
        const tasks: Promise<void>[] = [];
        tasks.push(lanceDB.addTable(TableFact, "fact"));
        await Promise.all(tasks);
    }
}