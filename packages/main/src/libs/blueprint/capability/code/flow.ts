import { CmdRunner } from "$libs/blueprint/runner/cmd.js";
import { runInnerFlow } from "$libs/innerflow/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";

async function runCommand(ctx: IRunnerContext, cmd: string, args?: Record<string, unknown>): Promise<void> {
    // 通过 `= {}` 提供默认空对象，防止 args 为 undefined 时解构报错
    const runner = new CmdRunner();
    const oldCmd = ctx.cmd;
    try {
        await runner.run(cmd, ctx, args);
    } finally {
        ctx.cmd = oldCmd;
    }
}

export function getFlow(ctx: IRunnerContext) {
    return {
        inner: runInnerFlow.bind(null, ctx),
        cmd: runCommand.bind(null, ctx)
    } as const
};
