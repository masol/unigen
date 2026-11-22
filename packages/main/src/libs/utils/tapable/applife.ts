/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EmbedSwitchPayload } from '$libs/searchsrv/index.js';
import type { App } from 'electron';
import Logger from 'electron-log/main.js';
import { Hookable, type HookCallback } from 'hookable';
import pTimeout from 'p-timeout';
import { TrackableDeferred } from '../promise.js';
import { AsyncParallelHook } from './hookable.js';

/**
 * 应用级生命周期管理。
 *
 * 提供两套 hook 接口：
 * - `beforeQuit` / `onEmbedSwitch`：AsyncParallelHook 风格（tap/tapPromise 兼容 tapable，
 *   注册方可使用返回的 unregister 函数做动态注销）。
 * - `hooks`：原生 Hookable 实例（**当前无内部使用**，保留以兼容潜在的高级调用方；
 *   若 grep 确认无引用可直接删除）。
 */
class AppLife {
    /**
     * 退出前清理钩子：所有回调并行执行，全部完成才算结束。
     * 注册方使用 `appLife.beforeQuit.tapPromise('name', fn)`，
     * 或 `tap(...)` 注册同步清理；通过返回的 unregister / `untap('name')` 注销。
     */
    public beforeQuit = new AsyncParallelHook();
    public onEmbedSwitch = new AsyncParallelHook<[EmbedSwitchPayload]>();

    /**
     * 原生 Hookable 实例，供需要细粒度控制的场景使用。
     */
    public hooks: Hookable<Record<string, HookCallback>> = new Hookable<Record<string, HookCallback>>();

    public bootstrapped: TrackableDeferred<void> = new TrackableDeferred<void>();

    private isCleanedUp = false;
    /** 与 isCleanedUp 分离：避免清理进行中再次触发 before-quit 导致 hook 重复执行 */
    private isCleaningUp = false;

    public init(app: App, timeoutMs: number = 30000): void {
        app.on('before-quit', async (e) => {
            if (this.isCleanedUp) return;

            if (this.isCleaningUp) {
                // 清理正在进行中：直接阻止二次进入，但保留退出阻断，直到清理完成或超时。
                e.preventDefault();
                return;
            }

            this.isCleaningUp = true;
            e.preventDefault();

            try {
                const startTs = Date.now();
                await pTimeout(
                    this.beforeQuit.promise(),
                    { milliseconds: timeoutMs, message: '退出清理超时' }
                );
                Logger.info(`[AppLife] 所有退出清理任务已完成。耗时: ${Date.now() - startTs}ms`);
            } catch (err: any) {
                if (err?.name === 'TimeoutError') {
                    Logger.error(`[AppLife] 退出清理超时 (${timeoutMs}ms)`);
                } else {
                    Logger.error(`[AppLife] 退出钩子执行出错:`, err);
                }
            } finally {
                this.isCleanedUp = true;
                this.isCleaningUp = false;
                app.quit();
            }
        });
    }
}

const KEY = Symbol.for('unigen.singleton.applife');

export const appLife: AppLife = ((globalThis as any)[KEY] ??= new AppLife());