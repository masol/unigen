// import { pathExists } from "fs-extra";
import { ORPCError } from "@orpc/server";
import { COMMON_ORPC_ERROR_DEFS } from "@orpc/client";
import { PrjDB } from "../controllers/drizzle/index.js";
import { IProjectContext } from "../type.js";
import Logger from "electron-log/main.js";
import { isDirEmpty } from "$libs/utils/sys/fs.js";
import { emptyDir } from "fs-extra";
import { configService } from "$libs/store/index.js";
import { LanceDB } from "../controllers/lance/index.js";
import { ProjectDbKeys } from "../dbkeys.js";



export async function openProject(prj: IProjectContext): Promise<void> {
    Logger.debug(`[Project] open ${prj.path}`)
    const pdb = PrjDB.ensure(prj);
    await pdb.open(false);
    const lance = LanceDB.ensure(prj);
    await lance.open();

    await prj.plugin.init(prj, false);
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


export async function createProject(prj: IProjectContext, bForce = false): Promise<boolean> {
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
    pdb.set(ProjectDbKeys.depplugins, [configService().get("plugin")]);
    pdb.set("version", __APP_VERSION__);
    const embed = configService().get("embed_model");
    if (embed) {
        pdb.set("embed", configService().get("embed_model"));
        const lance = LanceDB.ensure(prj);
        await lance.open();
    }

    await prj.plugin.init(prj, true);
    return true
}
