
import { MetaDirname } from "$libs/const.js";
import { configService } from "$libs/store/index.js";
import { path2URL } from "$libs/utils/sys/appfile.js";
import { os } from "@orpc/server";
import { randomUUID } from 'crypto';
import Logger from 'electron-log/main.js';
import { copy, ensureDir, pathExists } from 'fs-extra';
import { readdir, rm } from 'fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pMap from 'p-map';
import { extname, join } from 'path';
import { z } from 'zod';
import { RpcContext } from '../type.js';

// 任务参考图相关： @todo: 这属于video专有，应该使用tapable(hookable)将其改为插件实现！

const listMetaRes = os
    .input(z.string())
    .output(z.array(z.string()))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const visualrefDir = ctx.project.getPath([MetaDirname, ...input]);
        if (await pathExists(visualrefDir)) {
            const result = await readdir(visualrefDir);
            return result.map(item => join(visualrefDir, item));
        }
        return []
    });


const addMetaRes = os
    .input(z.object({
        dir: z.string(),
        paths: z.array(z.string())
    }))
    .output(z.array(z.string()))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const visualrefDir = ctx.project.getPath([MetaDirname, ...input.dir]);
        await ensureDir(visualrefDir)

        const result = await pMap(
            input.paths,
            async (src) => {
                const suffix = extname(src);
                const id = randomUUID();
                const dest = join(visualrefDir, `${id}${suffix}`)
                await copy(src, dest);
                return dest;
            },
            { concurrency: configService().get("concurrency") }
        )
        return result;
    });


const rmMetaRes = os
    .input(z.object({
        dir: z.string(),
        paths: z.array(z.string())
    }))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const visualrefDir = ctx.project.getPath([MetaDirname, ...input.dir]);
        await pMap(
            input.paths,
            async (src) => {
                if (src.startsWith(visualrefDir)) {
                    await rm(src, {
                        force: true
                    });
                } else {
                    Logger.error(`[Project VisualRef] 请求删除参考图${src},但是它不位于任务素材目录${visualrefDir}中，忽略请求。`)
                }
            },
            { concurrency: configService().get("concurrency") }
        )
    });



const getURL = os
    .input(z.string())
    .output(z.string())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;

        // 1. 绝对路径（含 Windows 盘符）→ 直接转换
        if (path.isAbsolute(input)) {
            return path2URL(input);
        }

        // 2. file: 协议 → 取出路径，再按相对/绝对处理
        if (input.toLowerCase().startsWith('file:')) {
            const filePath = fileURLToPath(input);
            return path.isAbsolute(filePath)
                ? path2URL(filePath)
                : path2URL(ctx.project.getPath([...filePath]));
        }

        // 3. 相对路径 → 走 project.getPath 解析
        return path2URL(ctx.project.getPath([...input]));
    });

export default {
    listMetaRes,
    addMetaRes,
    rmMetaRes,
    getURL,
}