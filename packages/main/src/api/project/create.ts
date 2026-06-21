
import { z } from 'zod'
import { ORPCError, os } from "@orpc/server";
import { WindowService } from '$libs/utils/window.js';
import { BrowserWindow, dialog } from 'electron';
import { RpcContext } from '../type.js';
import { projectManager } from '$libs/project/manager.js';
// import { configService } from '$libs/store/index.js';
import { UNIGEN_ERROR_DEFS } from '$libs/utils/err.js';
import { COMMON_ORPC_ERROR_DEFS } from "@orpc/client"
import { PrjDB } from '$libs/project/controllers/drizzle.js';
// import { PrjCreator } from '$libs/project/helper/create.js';

const open = os
    .input(z.string().optional())
    .handler(async ({ input, context }) => {
        let pathName = input;
        if (!pathName) {
            const { canceled, filePaths } = await WindowService.instance.withModalWindow(context, (parent) => {
                return dialog.showOpenDialog(parent, {
                    title: "打开项目",
                    message: "打开合法的Unigen项目。",
                    properties: ['openDirectory'],
                });
            })
            if (canceled || filePaths.length === 0) {
                throw new ORPCError(UNIGEN_ERROR_DEFS.USER_CANCEL.message, {
                    status: UNIGEN_ERROR_DEFS.USER_CANCEL.status,
                    message: "用户取消"
                })
            }
            pathName = filePaths[0];
        }

        const ctx = context as RpcContext;
        const prj = projectManager.getByPath(pathName);
        if (prj && prj.wid >= 0) {
            // if (prj.wid !== ctx.project.wid) {
            const window = BrowserWindow.fromId(prj.wid)
            window?.focus();
            throw new ORPCError(COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.message, {
                status: COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.status,
                message: "项目已被打开。"
            })
            // } else { // 已经被自身打开了。
            //     return true;
            // }
        }
        return await ctx.project.open(pathName);
    })



const create = os
    .input(
        z.object({
            path: z.string().optional(),
            force: z.boolean().optional()
        })
    )
    .handler(async ({ input, context }) => {
        let pathName = input.path;
        if (!pathName) {
            const { canceled, filePaths } = await WindowService.instance.withModalWindow(context, (parent) => {
                return dialog.showOpenDialog(parent, {
                    title: "新建项目",
                    message: "新建合法的Unigen项目。",
                    properties: ['openDirectory', 'createDirectory'],
                });
            })
            if (canceled || filePaths.length === 0) {
                throw new ORPCError(UNIGEN_ERROR_DEFS.USER_CANCEL.message, {
                    status: UNIGEN_ERROR_DEFS.USER_CANCEL.status,
                    message: "用户取消"
                })
            }
            pathName = filePaths[0];
        }

        const ctx = context as RpcContext;
        const prj = projectManager.getByPath(pathName);
        if (prj && prj.wid >= 0) {
            // if (prj.wid !== ctx.project.wid) {
            const window = BrowserWindow.fromId(prj.wid)
            window?.focus();
            throw new ORPCError(COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.message, {
                status: COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.status,
                message: "项目已被打开。"
            })
            // } else { // 已经被自身打开了。
            //     return true;
            // }
        }
        return await ctx.project.create(pathName, input.force);
    })


const info = os
    .input(z.string().optional())
    .output(z.string())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        let result = "";
        switch (input) {
            case 'path':
                result = ctx.project.path;
                break;
        }
        return result;
    });

const get = os
    .input(z.string())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        return PrjDB.ensure(ctx.project).get(input);
    });

const set = os
    .input(z.object({
        key: z.string(),
        value: z.any()
    }))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        return PrjDB.ensure(ctx.project).set(input.key, input.value);
    });


const close = os
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        return ctx.project.close();
    });

export default {
    open,
    create,
    info,
    get,
    set,
    close
}