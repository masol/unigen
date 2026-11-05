import { RunnerContext } from "$libs/blueprint/context.js";
import { CapaRunner, CmdRunner } from "$libs/blueprint/runner/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { appLife } from "$libs/utils/tapable/applife.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ChatStreamEvent, RunnerParam, RunState } from "$types/index.js";
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


export class PrjRunner extends BaseProjectController {
    static readonly serviceKey = Symbol.for('project.controller.PrjRunner');
    #runner: CapaRunner;
    #cmdrunner: CmdRunner | null = null;
    #unregisterBeforeQuit: (() => void) | null = null;

    constructor(ctx: IProjectContext) {
        super(ctx)
        this.#runner = new CapaRunner();
        // 通过 tapPromise 注册，保存 unregister 函数以便任务级注销
        this.#unregisterBeforeQuit = appLife.beforeQuit.tapPromise('PrjRunner', async () => {
            Logger.debug('[PrjRunner] 正在停止运行中的任务...');
            if (this.#runner.state === 'running' || this.#runner.state === 'terminating') {
                this.#runner.stop(true);
            }
            await this.#runner.waitFinish();
            Logger.debug('[PrjRunner] 任务已停止。');
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

    /**
     * @deprecated
     */
    get runState(): RunState {
        return this.#runner ? this.#runner.state : 'idle';
    }

    /**
     * @deprecated
     */
    get startTime(): number {
        return this.#runner ? this.#runner.startTime : 0;
    }

    /**
     * @deprecated
     * @returns 
     */
    async waitFinish(): Promise<void> {
        return this.#runner.waitFinish();
    }

    async runCommand(command: RunnerParam, fnReport: ((evt: ChatStreamEvent) => void) | null, signal?: AbortSignal | null): Promise<void> {
        if (this.#cmdrunner) {
            throwPrecondition("已经有一个命令在执行中，每个任务只能并行执行一个命令。并行命令，请自行撰写代码能力，并执行之。")
        }
        // const sessId = command.sessId ?? randomUUID();
        // if (sessId !== command.sessId) {
        //     // @todo:这里需要持久化新sess.
        //     throwUnprcessable("请求命令，但是未传入有效的sessionId.")
        // }
        const ctx = new RunnerContext(command, this.ctx, signal);
        ctx.fnReport = fnReport;

        // 使用 run 方法包裹，将 store 注入到这一层以及后续所有的同步/异步调用链中
        await runnerContextTLS.run(ctx, async () => {
            try {
                this.#cmdrunner = new CmdRunner();

                await this.#cmdrunner.run(command.msg, ctx)
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
                this.#cmdrunner = null;
                ctx.fnReport = null;
            }
        });
    }

    /**
     * @deprecated
     * @param entry 
     * @param seq 
     */
    start(entry?: string, seq?: number): void {
        void (entry);
        void (seq);
        // if (this.#cmdrunner) {
        //     const parallelRun = configService().get("parallelRun");
        //     if (!parallelRun) {
        //         throwPrecondition("有工作流改进任务在执行中，如果期望改进任务与工作流可以同步执行，在开发中启用并行执行。")
        //     }
        // }
        // const prjdb = PrjDB.ensure(this.ctx);
        // if (!entry) {
        //     const defEntry = prjdb.get<string>(ProjectDbKeys.entry_capa);
        //     if (!defEntry) {
        //         if (this.ctx.agent) {
        //             entry = localTypeName(this.ctx.type);
        //         }
        //         throwPrecondition("任务未指定默认启动的能力ID，也没有给出能力ID.")
        //     } else {
        //         entry = defEntry;
        //     }
        // }

        // @TODO: 移除start方法，改为runCommand，统一入口。并行执行的能力由用户自行编写能力来实现。
        // const ctx = new RunnerContext(randomUUID(), this.ctx, null, seq);

        // 使用 run 方法包裹，将 store 注入到这一层以及后续所有的同步/异步调用链中
        // runnerContextTLS.run(ctx, async () => {
        //     this.#runner.start(entry, ctx);
        // });
    }

    /**
     * @deprecated
     * @param bForce 
     */
    stop(bForce: boolean): void {
        this.#runner.stop(bForce);
    }
}