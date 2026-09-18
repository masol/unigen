import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import Logger from "electron-log/main.js";
import { BaseStorage } from "./base.js";
import { DocumentSplitConstitution } from "./type/ontology.js";
import { ExecInput, TaskWithKeyList } from "./type/tast.js";


export class TasksStorage extends BaseStorage {
    protected NS: string;

    constructor(protected readonly prjdb: PrjDB, taskId: string = "0") {
        super(prjdb);
        this.NS = `#tasks:${taskId}`;
    }

    getTasks(taskId = "0"): ExecInput[] | null {
        Logger.debug("get taskId", taskId)
        const result = this.get<ExecInput[]>(taskId);
        return result;
    }

    setTasks(tasks: ExecInput[], taskId: string = "0"): void {
        Logger.debug("set taskId", taskId)
        this.set(taskId, tasks);
    }

    setResult(key: string, result: string): void {
        this.set(`${key}.result`, result);
    }

    getResult(key: string): string | null {
        return this.get<string>(`${key}.result`);
    }


    getTaskleaf(ontology: DocumentSplitConstitution): TaskWithKeyList | null {
        const layerCnt = ontology.layers.length;

        const leafResult: TaskWithKeyList = [];

        /**
         * @param key   当前节点在 TasksStorage 中的键（根为 taskId，子节点为 `${key}.${index}`）
         * @param depth 当前节点所处层级（根节点为 0）
         */
        const collect = (key: string, depth: number): void => {
            const taskId = (depth > 0 ? `.${key}` : '');
            const tasks = this.getTasks(taskId);
            if (!tasks || tasks.length === 0) {
                Logger.debug(`No tasks found for key: ${key} at depth: ${depth}`);
                return;
            }

            // 中间层：返回的同样是 ExecInput[]，按其长度逐项递归
            if (depth < layerCnt - 1) {
                for (let i = 0; i < tasks.length; i++) {
                    collect(`${key}.${i}`, depth + 1);
                }
                return;
            }

            // 叶子层：按顺序直接收集，保持原有顺序
            leafResult.push(...tasks.map((task, index) => ({ key: `${key}.${index}`, task })));
        };

        collect("0", 0);

        return leafResult;
    }
}

