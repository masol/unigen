
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { chatSessionSchema, listSessionsParamsSchema } from "$types/shared/api/chat.js";
import { os } from "@orpc/server";
import { z } from 'zod';
import { RpcContext } from '../type.js';

// 任务参考图相关： @todo: 这属于video专有，应该使用tapable(hookable)将其改为插件实现！

const listSessions = os
    .input(listSessionsParamsSchema.optional())
    .output(z.array(chatSessionSchema))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        return PrjDB.ensure(ctx.project).listSessions({
            pageSize: 5000,
            orderBy: "createdAt",
            ...input
        });
    });


export default {
    listSessions,
}