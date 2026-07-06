import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { LanceDB } from "$libs/project/controllers/lance/index.js";
import { ILanceDB } from "$libs/project/controllers/lance/type.js";
import { ProjectDbKeys } from "$libs/project/dbkeys.js";
import { IProjectPlugin } from "$libs/project/plugin.js";
import { IProjectContext } from "$libs/project/type.js";
import { intereg } from "$libs/utils/blueprint/index.js";
import { PluginBase } from "../pluginbase.js";
import { loadDags } from "./capa/dag.js";
import { getAllExtendInters } from "./capa/index.js";
import { TableFact } from "./lance/fact.js";
import { videoMetags } from "./metag/index.js";


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
        // 初始化lance表格。
        const lance = LanceDB.ensure(prj);
        await this.initLanceTables(lance);

        // 初始化扩展的internal capa节点。
        const allInternal = getAllExtendInters();
        allInternal.forEach(i => {
            intereg.reg(i);
        })

        const prjdb: PrjDB = PrjDB.ensure(prj);

        const imported = prjdb.get<boolean>(ProjectDbKeys.imported);
        if (!imported) {
            // 尚未导入知识库。开始导入。
            prjdb.upcertMetag(videoMetags);
            await loadDags(prj, prjdb);
            prjdb.set(ProjectDbKeys.imported, true);
        }
    }

    private async initLanceTables(lanceDB: ILanceDB): Promise<void> {
        const tasks: Promise<void>[] = [];
        tasks.push(lanceDB.addTable(TableFact, "fact"));
        await Promise.all(tasks);
    }
}