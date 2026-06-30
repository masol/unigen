
import { z } from 'zod'
import { os } from "@orpc/server";
import { RpcContext } from '../type.js';
import { PrjRunner } from '$libs/project/controllers/runner.js';


const start = os
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        const runner = PrjRunner.ensure(ctx.project);
        runner.start();
    });


const stop = os
    .input(z.boolean().optional().default(false))
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext;
        const runner = PrjRunner.ensure(ctx.project);
        runner.stop(input);
    });


const waitFinish = os
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        const runner = PrjRunner.ensure(ctx.project);
        await runner.waitFinish();
    });

const runState = os
    .output(z.enum(['idle', 'running', 'terminating']))
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        const runner = PrjRunner.ensure(ctx.project);
        return runner.runState;
    });

const startTime = os
    .output(z.number())
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        const runner = PrjRunner.ensure(ctx.project);
        return runner.startTime;
    });

export default {
    start,
    stop,
    waitFinish,
    runState,
    startTime
}