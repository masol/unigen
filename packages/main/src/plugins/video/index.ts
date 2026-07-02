import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { LanceDB } from "$libs/project/controllers/lance/index.js";
import { ILanceDB } from "$libs/project/controllers/lance/type.js";
import { ProjectDbKeys } from "$libs/project/dbkeys.js";
import { IProjectPlugin } from "$libs/project/plugin.js";
import { IProjectContext } from "$libs/project/type.js";
import { DirectedGraph } from "graphology";
import { PluginBase } from "../pluginbase.js";
import { TableFact } from "./lance/fact.js";


const entryId = "40f832db-9735-4de0-91b1-df17311aa27d";

export class Plugin extends PluginBase {
    static type: string = "video";
    static async create(prj: IProjectContext): Promise<IProjectPlugin> {
        const inst = new Plugin(prj);
        return inst;
    }
    ////////////////////////////////////////////////

    constructor(protected ctx: IProjectContext) {
        super();
    }

    async init(prj: IProjectContext, _bCreate: boolean) {
        const lance = LanceDB.ensure(prj);
        await this.initLanceTables(lance);

        const version = 1;

        const graph = new DirectedGraph();
        graph.addNode('a59566b3-5ade-4965-b4a4-cfa8287216db');
        // graph.addNode('B');
        // graph.addNode('C');
        // graph.addNode('D');

        // graph.addEdge('a59566b3-5ade-4965-b4a4-cfa8287216db', 'B'); // A 执行完才能执行 B
        // graph.addEdge('a59566b3-5ade-4965-b4a4-cfa8287216db', 'C'); // A 执行完才能执行 C
        // graph.addEdge('B', 'D'); // B 执行完才能执行 D
        // graph.addEdge('C', 'D'); // C 执行完才能执行 D

        const serializedObject = graph.export();
        const wfstr = JSON.stringify(serializedObject);

        const prjDb = PrjDB.ensure(prj);

        const oldEntry = prjDb.getCapaById(entryId);
        if (!oldEntry || oldEntry.version !== version) {
            const newcapa = prjDb.upsertCapa({
                id: entryId,
                name: "#workflow",
                process: [wfstr],
                version
            })
            console.log("newcapa=", newcapa)
        }


        prjDb.set(ProjectDbKeys.entry_capa, entryId);

        // const graph = new DirectedGraph();
        // graph.addNode('A');
        // graph.addNode('B');
        // graph.addNode('C');
        // graph.addNode('D');

        // graph.addEdge('A', 'B'); // A 执行完才能执行 B
        // graph.addEdge('A', 'C'); // A 执行完才能执行 C
        // graph.addEdge('B', 'D'); // B 执行完才能执行 D
        // graph.addEdge('C', 'D'); // C 执行完才能执行 D

        // this.#runner = new CapaRunner(graph);
    }

    private async initLanceTables(lanceDB: ILanceDB): Promise<void> {
        const tasks: Promise<void>[] = [];
        tasks.push(lanceDB.addTable(TableFact, "fact"));
        await Promise.all(tasks);
    }
}