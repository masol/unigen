
import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { GetItemInputSchema } from '$types/shared/api/list.js';
import { os } from "@orpc/server";
import { z } from 'zod';
import { RpcContext } from '../type.js';

// 对blueprint相关表的编辑或内容获取。
const getContent = os
    .input(GetItemInputSchema)
    .output(z.string())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        return PrjDB.ensure(ctx.project).getContent(input);
    });

export default {
    getContent
}