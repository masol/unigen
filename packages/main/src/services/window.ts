import { z } from 'zod'
import { os } from "@orpc/server";
import { BrowserWindow } from 'electron';
import { WindowService } from '$libs/utils/window.js';

const windowInput = z.number().describe('BrowserWindow id')

// ----------窗口状态枚举 ----------
const WindowStateSchema = z.object({
    isMaximized: z.boolean(),
    isMinimized: z.boolean(),
    isFullScreen: z.boolean(),
    isFocused: z.boolean(),
    isVisible: z.boolean(),
    isDestroyed: z.boolean(),
    bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
    }),
})

type WindowState = z.infer<typeof WindowStateSchema>

// ---------- 辅助函数 ----------
function withWindow(id: number, action: (win: BrowserWindow) => void): boolean {
    const win = BrowserWindow.fromId(id);
    if (win && !win.isDestroyed()) {
        action(win);
        return true;
    }
    return false;
}

// ---------- 最大化 ----------
const max = os
    .input(windowInput)
    .output(z.boolean())
    .handler(({ input }): boolean => {
        return withWindow(input, (win) => win.maximize());
    })

// ---------- 最小化 ----------
const min = os
    .input(windowInput)
    .output(z.boolean())
    .handler(({ input }): boolean => {
        return withWindow(input, (win) => win.minimize());
    })

// ---------- 还原 ----------
const restore = os
    .input(windowInput)
    .output(z.boolean())
    .handler(({ input }): boolean => {
        return withWindow(input, (win) => win.restore());
    })

// ---------- 显示 ----------
const show = os
    .input(windowInput)
    .output(z.boolean())
    .handler(({ input }): boolean => {
        return withWindow(input, (win) => WindowService.instance.showWindow(win));
    })

// ---------- 聚焦 ----------
const focus = os
    .input(windowInput)
    .output(z.boolean())
    .handler(({ input }): boolean => {
        return withWindow(input, (win) => win.focus());
    })

// ---------- 关闭 ----------
const close = os
    .input(windowInput)
    .output(z.boolean())
    .handler(({ input }): boolean => {
        return withWindow(input, (win) => win.close());
    })

// ---------- 获取窗口状态 ----------
const getState = os
    .input(windowInput)
    .output(WindowStateSchema.nullable())
    .handler(({ input }): WindowState | null => {
        const win = BrowserWindow.fromId(input);
        if (!win || win.isDestroyed()) {
            return null;
        }
        const bounds = win.getBounds();
        return {
            isMaximized: win.isMaximized(),
            isMinimized: win.isMinimized(),
            isFullScreen: win.isFullScreen(),
            isFocused: win.isFocused(),
            isVisible: win.isVisible(),
            isDestroyed: win.isDestroyed(),
            bounds: {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
            },
        };
    })

export default {
    max,
    min,
    restore,
    show,
    focus,
    close,
    getState,
}