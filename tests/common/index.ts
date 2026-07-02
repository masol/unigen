
import type { JSHandle } from '@playwright/test';
import { expect } from '@playwright/test';
import type { BrowserWindow } from 'electron';
import type { UnigenTestType } from '../type';

// 导出一个普通函数，接收 test 实例
export function runCommonTest(test: UnigenTestType) {
    test('Main window state', async ({ electronApp, page }) => {
        // 1. 获取主窗口句柄
        const window: JSHandle<BrowserWindow> = await electronApp.browserWindow(page);

        // 2. 核心改进：在 Playwright 宿主端进行轮询等待，不要在 Electron 内部死等事件
        const checkState = async () => {
            return await window.evaluate((mainWindow) => {
                // 增加防御：防止窗口已经被销毁导致报错
                if (!mainWindow || mainWindow.isDestroyed()) {
                    return { isVisible: false, isDevToolsOpened: false, isCrashed: true };
                }
                return {
                    isVisible: mainWindow.isVisible(),
                    isDevToolsOpened: mainWindow.webContents ? mainWindow.webContents.isDevToolsOpened() : false,
                    isCrashed: mainWindow.webContents ? mainWindow.webContents.isCrashed() : true,
                };
            });
        };

        // 3. 使用 expect.poll 自动重试，直到窗口可见（默认超时时间内）
        // 这样无论 ready-to-show 是已经发生还是正在发生，都能完美兼容
        await expect.poll(async () => {
            const state = await checkState();
            return state.isVisible;
        }, {
            message: '等待主窗口变为可见状态超时',
            timeout: 15000, // 给打包应用 15 秒的启动和渲染时间
        }).toBe(true);

        // 4. 最终状态断言
        const finalState = await checkState();
        expect(finalState.isCrashed, '应用不幸崩溃了').toEqual(false);
        expect(finalState.isDevToolsOpened, '生产测试环境下 DevTools 不应该被打开').toEqual(false);
    });
}