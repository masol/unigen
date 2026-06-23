import { AsyncParallelHook } from 'tapable';
import pTimeout from 'p-timeout';
import type { App } from 'electron';
import Logger from 'electron-log/main.js';

class AppLife {
    public hooks = {
        beforeQuit: new AsyncParallelHook<[]>()
    };

    private isCleanedUp = false;

    public init(app: App, timeoutMs: number = 30000): void {
        // 去掉 (e: Event) 的 : Event，让 TS 自动推导
        app.on('before-quit', async (e) => {
            if (this.isCleanedUp) return;

            // 此时 e 具有 preventDefault() 方法，且不会报错
            e.preventDefault();

            try {
                Logger.log('[AppLife] 开始并行执行退出任务...');

                await pTimeout(
                    this.hooks.beforeQuit.promise(),
                    {
                        milliseconds: timeoutMs,
                        message: '退出清理超时'
                    }
                );

                Logger.log('[AppLife] 所有任务按时完成。');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                if (err.name === 'TimeoutError') {
                    Logger.warn(`[AppLife] 退出清理超时，正在强行关闭...`);
                } else {
                    Logger.error(`[AppLife] 某个插件在退出时崩溃: ${err?.message || err}`);
                }
            } finally {
                this.isCleanedUp = true;
                app.quit();
            }
        });
    }
}

export const appLife = new AppLife();
