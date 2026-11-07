import { intereg } from "$libs/blueprint/index.js";
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { IProjectPlugin } from "$libs/project/plugin.js";
import { IProjectContext } from "$libs/project/type.js";
import { ProjectDbKeys } from "$libs/utils/db/dbkeys.js";
import { knowledgeCenter } from "$libs/utils/kc.js";
import { PluginBase } from "../pluginbase.js";
import { getAllExtendInters } from "./capa/index.js";

//dag: loaded from kc.
const entryId = "40f832db-9735-4de0-91b1-df17311aa27d";

export class Plugin extends PluginBase {
    readonly type: string = "video";
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

        // 初始化扩展的internal capa节点。
        const allInternal = getAllExtendInters();
        allInternal.forEach(i => {
            intereg.reg(i);
        })

        const prjdb: PrjDB = PrjDB.ensure(prj);
        const imported = prjdb.get<boolean>(ProjectDbKeys.imported);
        if (!imported) {
            // 尚未导入知识库。开始导入。
            await knowledgeCenter.initProject(prj, ["video", "cap"]);

            prjdb.set(ProjectDbKeys.entry_capa, entryId);
            prjdb.set(ProjectDbKeys.imported, true);
        }
    }

}