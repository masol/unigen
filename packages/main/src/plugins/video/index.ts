import { ILanceDB } from "$libs/project/controllers/lance/type.js";
import { IProjectPlugin } from "$libs/project/plugin.js";
import { IProjectContext } from "$libs/project/type.js";
import { WorkflowContext } from "$libs/utils/blueprint/context.js";
import { WorkflowRunner } from "$libs/utils/blueprint/runer.js";
import { throwPrecondition } from "$libs/utils/err.js";
import type { RunState } from "$types/index.js";
import { DirectedGraph } from "graphology";
import { PluginBase } from "../pluginbase.js";
import { TableFact } from "./lance/fact.js";


export class Plugin extends PluginBase {
    static type: string = "video";
    static async create(prj: IProjectContext): Promise<IProjectPlugin> {
        const inst = new Plugin(prj);
        await inst.init();
        return inst;
    }
    ////////////////////////////////////////////////
    #runner: WorkflowRunner | null = null;

    constructor(protected ctx: IProjectContext) {
        super();
    }

    private ensureRunner(): WorkflowRunner {
        if (!this.#runner) {
            throwPrecondition("[video plugin] runner未初始化。")
        }
        return this.#runner;
    }

    get runState(): RunState {
        return this.#runner ? this.#runner.state : 'idle';
    }

    get startTime(): number {
        return this.#runner ? this.#runner.startTime : 0;
    }

    async init() {
        const graph = new DirectedGraph();
        graph.addNode('A');
        graph.addNode('B');
        graph.addNode('C');
        graph.addNode('D');

        graph.addEdge('A', 'B'); // A 执行完才能执行 B
        graph.addEdge('A', 'C'); // A 执行完才能执行 C
        graph.addEdge('B', 'D'); // B 执行完才能执行 D
        graph.addEdge('C', 'D'); // C 执行完才能执行 D

        this.#runner = new WorkflowRunner(graph);
    }

    async initLanceTables(lanceDB: ILanceDB): Promise<void> {
        const tasks: Promise<void>[] = [];
        tasks.push(lanceDB.addTable(TableFact, "fact"));
        await Promise.all(tasks);
    }

    async waitFinish(): Promise<void> {
        return this.ensureRunner().waitFinish();
    }

    start(): void {
        const ctx = new WorkflowContext(this.ctx);
        this.ensureRunner().start(ctx);
    }

    stop(bForce: boolean): void {
        this.ensureRunner().stop(bForce);
    }

}