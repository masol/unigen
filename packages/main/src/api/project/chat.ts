
import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { ProjectDbKeys } from "$libs/utils/db/dbkeys.js";
import { throwUnprcessable } from "$libs/utils/err.js";
import { chatMessageSchema, chatSessionSchema, listMessagesParamsSchema, listSessionsParamsSchema, newChatMessageSchema } from "$types/shared/api/chat.js";
import { os } from "@orpc/server";
import { z } from 'zod';
import { RpcContext } from '../type.js';

// 任务参考图相关： @todo: 这属于video专有，应该使用tapable(hookable)将其改为插件实现！

const listSessions = os
    .input(listSessionsParamsSchema.optional())
    .output(z.object({
        active: z.string(),
        sesses: z.array(chatSessionSchema)
    }))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        const oldActive = prjdb.get<string>(ProjectDbKeys.sessionId);
        const sesses = prjdb.listSessions({
            pageSize: 5000,
            orderBy: "createdAt",
            ...input
        });
        let active: string;
        if (sesses.length > 0) {
            active = oldActive ? oldActive : sesses[0].id;
        } else {
            active = prjdb.createSession()
            const sess = prjdb.getSession(active);
            if (!sess) {
                throwUnprcessable("无法创建session")
            }
            sesses.push(sess);
        }
        if (active !== oldActive)
            prjdb.set(ProjectDbKeys.sessionId, active);
        return {
            active,
            sesses,
        }
    });



const deleteSession = os
    .input(z.string())
    .output(z.void())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        prjdb.deleteSession(input);
    });


const createSession = os
    .input(z.void())
    .output(chatSessionSchema)
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        const active = prjdb.createSession()
        const sess = prjdb.getSession(active);
        if (!sess) {
            throwUnprcessable("无法创建session")
        }
        prjdb.set(ProjectDbKeys.sessionId, active);
        return sess;
    });



const updateSessTitle = os
    .input(z.object({
        id: z.string(),
        title: z.string()
    }))
    .output(z.void())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        prjdb.updateSessionTitle(input.id, input.title);
    });



const listMessage = os
    .input(listMessagesParamsSchema)
    .output(z.array(chatMessageSchema))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        const result = prjdb.listMessages(input);
        return result;
    });


const deleteMessage = os
    .input(z.string())
    .output(z.void())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        prjdb.deleteMessage(input);
    });



const deleteMessagesAfter = os
    .input(z.object({
        sid: z.string(),
        fromTs: z.number()
    }))
    .output(z.void())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        if (input.fromTs == 0) {
            prjdb.clearMessages(input.sid)
        } else {
            prjdb.deleteMessagesAfter(input.sid, input.fromTs);
        }
    });



const newMessage = os
    .input(newChatMessageSchema)
    .output(z.string())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        const result = prjdb.saveMessage(input);
        return result;
    });

const pinSession = os
    .input(z.object({
        id: z.string(),
        pin: z.boolean()
    }))
    .output(z.void())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const prjdb = PrjDB.ensure(ctx.project);
        const result = prjdb.updateSessionPinned(input.id, input.pin);
        return result;
    });

export default {
    listSessions,
    deleteSession,
    createSession,
    pinSession,
    updateSessTitle,
    listMessage,
    deleteMessage,
    deleteMessagesAfter,
    newMessage
}