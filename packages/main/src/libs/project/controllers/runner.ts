import { RunnerContext } from "$libs/blueprint/context.js";
import { CmdRunner } from "$libs/blueprint/runner/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { appLife } from "$libs/utils/tapable/applife.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ChatStreamEvent, RunnerParam } from "$types/index.js";
import { AsyncLocalStorage } from "async_hooks";
import Logger from "electron-log/main.js";
import { getErrorMessage } from "radashi";
import type { IProjectContext } from "../type.js";
import { BaseProjectController } from "./base.js";


const runnerContextTLS = new AsyncLocalStorage<IRunnerContext>();

export function getRunnerContextWithNull(): IRunnerContext | null {
    return runnerContextTLS.getStore() ?? null;
}

export function getRunnerContext(): IRunnerContext {
    const ctx = getRunnerContextWithNull();
    if (!ctx) {
        throwPrecondition("getRunnerContext()无法获取 IRunnerContext");
    }
    return ctx;
}

type ActiveCmd = {
    runner: CmdRunner;
    ctx: IRunnerContext;
};

export class PrjRunner extends BaseProjectController {
    static readonly serviceKey = Symbol.for('project.controller.PrjRunner');
    #cmdRunners = new Map<number, ActiveCmd>();
    #unregisterBeforeQuit: (() => void) | null = null;

    constructor(ctx: IProjectContext) {
        super(ctx)
        // 通过 tapPromise 注册，保存 unregister 函数以便任务级注销
        this.#unregisterBeforeQuit = appLife.beforeQuit.tapPromise('PrjRunner', async () => {
            Logger.debug('[PrjRunner] 正在停止运行中的命令...');
            const active = Array.from(this.#cmdRunners.values());
            for (const { ctx } of active) {
                ctx.triggerAbort(true);
            }
            await Promise.all(active.map(({ runner }) => runner.waitFinish()));
            Logger.debug('[PrjRunner] 命令已停止。');
        });
    }

    /**
     * 任务销毁时调用，注销 beforeQuit 钩子，释放内存。
     */
    dispose(): void {
        this.#unregisterBeforeQuit?.();
        this.#unregisterBeforeQuit = null;
    }

    static ensure(ctx: IProjectContext): PrjRunner { return this.coreEnsure(this, ctx); }

    async waitFinish(): Promise<void> {
        await Promise.all(
            Array.from(this.#cmdRunners.values(), ({ runner }) => runner.waitFinish())
        );
    }

    async runCommand(command: RunnerParam, fnReport: ((evt: ChatStreamEvent) => void) | null, signal?: AbortSignal | null): Promise<void> {
        const ctx = new RunnerContext(command, this.ctx, signal);
        if (this.#cmdRunners.has(ctx.seq)) {
            throwPrecondition(`命令 seq=${ctx.seq} 已在执行中，不能重复启动同一 seq 的命令。`);
        }
        ctx.fnReport = fnReport;

        // 使用 run 方法包裹，将 store 注入到这一层以及后续所有的同步/异步调用链中
        await runnerContextTLS.run(ctx, async () => {
            const runner = new CmdRunner();
            this.#cmdRunners.set(ctx.seq, { runner, ctx });
            try {
                await runner.run(command.msg, ctx)
            } catch (e) {
                const msg = `## 命令执行错误： 
${getErrorMessage(e)}`;
                if (fnReport) {
                    fnReport({
                        type: "message.error",
                        messageId: "0",
                        error: msg
                    });
                }
            } finally {
                this.#cmdRunners.delete(ctx.seq);
                ctx.fnReport = null;
            }
        });
    }
}