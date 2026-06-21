// import { pathExists } from "fs-extra";
import { ORPCError } from "@orpc/server";
import { COMMON_ORPC_ERROR_DEFS } from "@orpc/client";
import { PrjDB } from "../controllers/drizzle.js";
import { IProjectContext } from "../type.js";
import Logger from "electron-log/main.js";
import { isDirEmpty } from "$libs/utils/sys/fs.js";
import { emptyDir } from "fs-extra";
import { configService } from "$libs/store/index.js";



export async function openProject(prj: IProjectContext): Promise<void> {
    Logger.debug(`[Project] open ${prj.path}`)
    const pdb = PrjDB.ensure(prj);
    await pdb.open(false);
}

export async function closeProject(prj: IProjectContext): Promise<void> {
    Logger.debug(`[Project] close ${prj.path}`)
    if (!prj.path) { // 未打开项目，关闭之。
        return;
    }
    const pdb = PrjDB.ensure(prj);
    pdb.close();
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
    pdb.set("dep", [configService().get("plugin")])

    return true
}


// export function projectGet<T>(prj: IProjectContext, key: string): T | null {
//     return PrjDB.ensure(prj).get<T>(key);
// }


// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// export function projectSet(prj: IProjectContext, key: string, value: any): void {
//     PrjDB.ensure(prj).set(key, value);
// }