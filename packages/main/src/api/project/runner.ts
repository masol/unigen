
import { z } from 'zod'
import { os } from "@orpc/server";
import { RpcContext } from '../type.js';


const start = os
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        ctx.project.plugin.start();
    });


const stop = os
    .input(z.boolean().optional().default(false))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        ctx.project.plugin.stop(input);
    });


const waitFinish = os
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        await ctx.project.plugin.waitFinish();
    });

const runState = os
    .output(z.enum(['idle', 'running', 'terminating']))
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        return ctx.project.plugin.runState;
    });

const startTime = os
    .output(z.number())
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        return ctx.project.plugin.startTime;
    });

export default {
    start,
    stop,
    waitFinish,
    runState,
    startTime
}