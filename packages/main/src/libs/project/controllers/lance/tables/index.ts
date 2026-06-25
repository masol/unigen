import { ILanceDB } from "../type.js";
import { TableFact } from "./fact.js";


export async function initAllTables(lanceDB: ILanceDB) {

    const tasks: Promise<void>[] = [];
    tasks.push(lanceDB.addTable(TableFact, "fact"));

    await Promise.all(tasks);
}