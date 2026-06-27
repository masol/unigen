import { ILanceDB } from "../type.js";
import { TableCapa } from "./capability.js";
import { IProjectContext } from "$libs/project/type.js";


export async function initAllTables(lanceDB: ILanceDB, prj: IProjectContext) {

    const tasks: Promise<void>[] = [];
    tasks.push(lanceDB.addTable(TableCapa, "capability"));
    tasks.push(prj.plugin.initLanceTables(lanceDB, prj));

    await Promise.all(tasks);
}