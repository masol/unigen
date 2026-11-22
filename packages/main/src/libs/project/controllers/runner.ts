import { RunnerContext } from "$libs/blueprint/context.js";
import { CmdRunner } from "$libs/blueprint/runner/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { appLife } from "$libs/utils/tapable/applife.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import type { ChatStreamEvent, RunnerParam } from "$types/index.js";
import { AsyncLocalStorage } from "async_hooks";
import Logger from "electron-log/main.js";
import pTimeout from "p-timeout";
import { getErrorMessage } from "radashi";
import type { IProjectContext } from "../type.js";
import { BaseProjectController } from "./base.js";

const RUNNER_CONTEXT_TLS_KEY = Symbol.for('unigen.singleton.runnerContextTLS');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runnerContextTLS: AsyncLocalStorage<IRunnerContext> = ((globalThis as any)[RUNNER_CONTEXT_TLS_KEY] ??= new AsyncLocalStorage<IRunnerContext>());

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

/** forceQuit 默认超时（毫秒）。若命令内部有不可中断的阻塞，超时后放行由用户兜底重启。 */
const FORCE_QUIT_DEFAULT_TIMEOUT_MS = 8_000;

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
                ctx.triggerAbort();
            }
            await Promise.all(active.map(({ runner }) => runner.waitFinish()));
            Logger.debug('[PrjRunner] 命令已停止。');
        });
    }

    // 检查指定的seq是否运行中--位于cmdRunners Map中。true表示运行中，false未运行。
    isRunning(seq: number): boolean {
        return this.#cmdRunners.has(seq);
    }

    /**
     * 是否有任意正在执行中的命令。
     * 用于「关闭/切换项目前」的前置检查——切换项目会连带销毁执行环境，
     * 若有任务正在跑，必须先提示用户并允许其选择终止或等待。
     */
    hasRunning(): boolean {
        return this.#cmdRunners.size > 0;
    }

    /**
     * 任务销毁时调用，注销 beforeQuit 钩子，释放内存。
     */
    dispose(): void {
        this.#unregisterBeforeQuit?.();
        this.#unregisterBeforeQuit = null;
    }

    static ensure(ctx: IProjectContext): PrjRunner { return this.coreEnsure(this, ctx); }

    async waitFinish(timeoutMs: number = FORCE_QUIT_DEFAULT_TIMEOUT_MS): Promise<boolean> {
        const active = Array.from(this.#cmdRunners.values());
        if (active.length === 0) {
            return true;
        }
        try {
            await pTimeout(
                Promise.all(active.map(({ runner }) => runner.waitFinish())),
                {
                    milliseconds: timeoutMs,
                    message: `[PrjRunner] forceQuit: ${timeoutMs}ms 内未能结束全部命令`,
                },
            );
            Logger.info(`[PrjRunner] forceQuit: ${active.length} 个命令已结束`);
            return true;
        } catch (e) {
            Logger.error('[PrjRunner] forceQuit 超时或失败', e);
            return false;
        }
    }

    /**
     * 强制终止所有执行中的命令，并等待其真正释放资源。
     *
     * 与 `waitFinish` 的区别：先主动向每个 ctx 发送 abort 信号，让底层
     * 异步操作有机会响应取消（例如关闭流、回滚事务）；再做等待。同时
     * 用 p-timeout 兜底，防止个别命令内部阻塞导致关闭/切换项目永久挂起。
     *
     * @param timeoutMs 超时时间（毫秒），默认 8000。
     * @returns true：全部命令在超时内结束（或没有命令）；
     *          false：超时，仍有命令在运行，调用方应提示用户重启。
     */
    async forceQuit(timeoutMs: number = FORCE_QUIT_DEFAULT_TIMEOUT_MS): Promise<boolean> {
        const active = Array.from(this.#cmdRunners.values());
        if (active.length === 0) {
            return true;
        }

        for (const { ctx } of active) {
            try {
                ctx.triggerAbort();
            } catch (e) {
                Logger.error('[PrjRunner] forceQuit: triggerAbort failed', e);
            }
        }

        return await this.waitFinish(timeoutMs);
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
        ctx.fnReport = null;
        ctx.clear();
    }
}