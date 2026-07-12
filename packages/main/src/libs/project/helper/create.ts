// import { pathExists } from "fs-extra";
import { configService } from "$libs/store/index.js";
import { secondConfig } from "$libs/store/second.js";
import { knowledgeCenter } from "$libs/utils/kc.js";
import { isDirEmpty } from "$libs/utils/sys/fs.js";
import { COMMON_ORPC_ERROR_DEFS } from "@orpc/client";
import { ORPCError } from "@orpc/server";
import Logger from "electron-log/main.js";
import { emptyDir } from "fs-extra";
import { ProjectDbKeys } from "../../utils/db/dbkeys.js";
import { PrjDB } from "../controllers/drizzle/index.js";
import { LanceDB } from "../controllers/lance/index.js";
import { IProjectContext } from "../type.js";



export async function openProject(prj: IProjectContext, icon: string): Promise<void> {
    Logger.debug(`[Project] open ${prj.path}`)
    const pdb = PrjDB.ensure(prj);
    await pdb.open(false);
    const lance = LanceDB.ensure(prj);
    await lance.open();

    secondConfig().addProject(prj.path, (new Date()).getTime(), icon)
    // await prj.plugin.init(prj, false);
}

export async function closeProject(prj: IProjectContext): Promise<void> {
    if (!prj.path) { // 未打开项目，关闭之。
        return;
    }
    Logger.debug(`[Project] close ${prj.path}`)
    const pdb = PrjDB.ensure(prj);
    pdb.close();
    const lance = LanceDB.ensure(prj);
    lance.close();
}


export async function createProject(prj: IProjectContext, type: string, icon: string, bForce = false): Promise<boolean> {
    Logger.debug(`[Project] open ${prj.path}`)

    const isEmpty = await isDirEmpty(prj.path);
    if (!isEmpty) {
        if (bForce) {
            await emptyDir(prj.path)
        } else {
            // 非强制创建，并且路径非空。
            throw new ORPCError(COMMON_ORPC_ERROR_DEFS.UNSUPPORTED_MEDIA_TYPE.message, {
                status: COMMON_ORPC_ERROR_DEFS.UNSUPPORTED_MEDIA_TYPE.status,
                message: prj.path
            })
        }
    }

    const pdb = PrjDB.ensure(prj);
    await pdb.open(true);
    // pdb.set(ProjectDbKeys.depplugins, [configService().get("plugin")]);
    pdb.set(ProjectDbKeys.version, __APP_VERSION__);
    pdb.set(ProjectDbKeys.projectType, type)
    const embed = configService().get("embed_model");
    if (embed) {
        pdb.set("embed", configService().get("embed_model"));
        const lance = LanceDB.ensure(prj);
        await lance.open();
    }

    await knowledgeCenter.initProject(prj, type);
    // await prj.plugin.init(prj, true);

    secondConfig().addProject(prj.path, (new Date()).getTime(), icon)
    return true
}
