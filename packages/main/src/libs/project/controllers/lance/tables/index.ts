import { ILanceDB } from "../type.js";
import { TableCapa } from "./capability.js";


export async function initAllTables(lanceDB: ILanceDB) {

    const tasks: Promise<void>[] = [];
    tasks.push(lanceDB.addTable(TableCapa, "capability"));
    // tasks.push(prj.plugin.initLanceTables(lanceDB));

    await Promise.all(tasks);
}