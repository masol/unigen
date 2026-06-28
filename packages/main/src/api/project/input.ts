
import { z } from 'zod'
import { os } from "@orpc/server";
import { RpcContext } from '../type.js';
import { readdir, rm } from 'fs/promises';
import pMap from 'p-map';
import { copy, ensureDir, pathExists } from 'fs-extra';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import Logger from 'electron-log/main.js';
// import { PrjCreator } from '$libs/project/helper/create.js';

const visualref = os
    .output(z.array(z.string()))
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        const visualrefDir = ctx.project.getPath('visualref');
        if (await pathExists(visualrefDir)) {
            const result = await readdir(visualrefDir);
            return result.map(item => join(visualrefDir, item));
        }
        return []
    });


const addvref = os
    .input(z.array(z.string()))
    .output(z.array(z.string()))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const visualrefDir = ctx.project.getPath('visualref');
        await ensureDir(visualrefDir)

        const result = await pMap(
            input,
            async (src) => {
                const suffix = extname(src);
                const id = randomUUID();
                const dest = join(visualrefDir, `${id}${suffix}`)
                await copy(src, dest);
                return dest;
            },
            { concurrency: 6 }
        )
        return result;
    });


const rmvref = os
    .input(z.array(z.string()))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const visualrefDir = ctx.project.getPath('visualref');

        await pMap(
            input,
            async (src) => {
                if (src.startsWith(visualrefDir)) {
                    await rm(src, {
                        force: true
                    });
                } else {
                    Logger.error(`[Project VisualRef] 请求删除参考图${src},但是它不位于项目素材目录${visualrefDir}中，忽略请求。`)
                }
            },
            { concurrency: 6 }
        )
    });
export default {
    visualref,
    addvref,
    rmvref,
}