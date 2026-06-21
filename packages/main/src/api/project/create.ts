
import { z } from 'zod'
import { os } from "@orpc/server";
import { WindowService } from '$libs/utils/window.js';
import { BrowserWindow, dialog } from 'electron';
import { RpcContext } from '../type.js';
import { projectManager } from '$libs/project/manager.js';
import { configService } from '$libs/store/index.js';

const open = os
    .input(z.string().optional())
    .output(z.boolean())
    .handler(async ({ input, context }) => {
        let pathName = input;
        if (!pathName) {
            const { canceled, filePaths } = await WindowService.instance.withModalWindow(context, (parent) => {
                return dialog.showOpenDialog(parent, {
                    properties: ['openDirectory', 'createDirectory'],
                });
            })

            if (canceled || filePaths.length === 0) {
                return false;
            }

            pathName = filePaths[0];
        }

        const prj = projectManager.getByPath(pathName);
        if (prj && prj.wid >= 0) {
            const window = BrowserWindow.fromId(prj.wid)
            window?.focus();
            return false;
        }

        const ctx = context as RpcContext;
        return await ctx.project.open(pathName)
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
        }
        return result;
    });


const dep = os
    .output(z.array(z.string()))
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        void ctx;
        const result = [configService().get("plugin")];
        return result;
    });

export default {
    open,
    info,
    dep
}