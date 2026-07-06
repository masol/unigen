import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { ProjectDbKeys } from "$libs/project/dbkeys.js";
import type { IProjectContext } from "$libs/project/type.js";
import { DirectedGraph } from "graphology";


const entryId = "40f832db-9735-4de0-91b1-df17311aa27d";

function imporMainDag(prjDb: PrjDB) {
    const graph = new DirectedGraph();
    graph.addNode('a59566b3-5ade-4965-b4a4-cfa8287216db');
    graph.addNode('B');
    // graph.addNode('C');
    // graph.addNode('D');

    graph.addEdge('a59566b3-5ade-4965-b4a4-cfa8287216db', 'B'); // A 执行完才能执行 B
    // graph.addEdge('a59566b3-5ade-4965-b4a4-cfa8287216db', 'C'); // A 执行完才能执行 C
    // graph.addEdge('B', 'D'); // B 执行完才能执行 D
    // graph.addEdge('C', 'D'); // C 执行完才能执行 D

    const serializedObject = graph.export();
    const wfstr = JSON.stringify(serializedObject);


    const newcapa = prjDb.upsertCapa({
        id: entryId,
        name: "#workflow",
        code: wfstr,
    });
    console.log("new dag capa id=", newcapa)


    prjDb.set(ProjectDbKeys.entry_capa, entryId);
}


export async function loadDags(prj: IProjectContext, prjdb: PrjDB) {
    imporMainDag(prjdb);
}