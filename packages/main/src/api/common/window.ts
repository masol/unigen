import { throwPrecondition } from '$libs/utils/err.js';
import { WindowService } from '$libs/utils/window.js';
import { os } from "@orpc/server";
import { BrowserWindow } from 'electron';
import { z } from 'zod';
import { RpcContext } from '../type.js';

// ---------- 窗口状态枚举 ----------
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
    .output(z.boolean())
    .handler(({ context }): boolean => {
        const ctx = context as RpcContext;
        return withWindow(ctx.project.wid, (win) => win.maximize());
    })

// ---------- 最小化 ----------
const min = os
    .output(z.boolean())
    .handler(({ context }): boolean => {
        const ctx = context as RpcContext;
        return withWindow(ctx.project.wid, (win) => win.minimize());
    })

// ---------- 还原 ----------
const restore = os
    .output(z.boolean())
    .handler(({ context }): boolean => {
        const ctx = context as RpcContext;
        return withWindow(ctx.project.wid, (win) => win.restore());
    })

// ---------- 显示 ----------
const show = os
    .output(z.boolean())
    .handler(({ context }): boolean => {
        const ctx = context as RpcContext;
        return withWindow(ctx.project.wid, (win) => WindowService.instance.showWindow(win));
    })

// ---------- 聚焦 ----------
const focus = os
    .output(z.boolean())
    .handler(({ context }): boolean => {
        const ctx = context as RpcContext;
        return withWindow(ctx.project.wid, (win) => win.focus());
    })

// ---------- 关闭 ----------
const close = os
    .output(z.boolean())
    .handler(({ context }): boolean => {
        const ctx = context as RpcContext;
        return withWindow(ctx.project.wid, (win) => win.close());
    })

// ---------- 获取窗口状态 ----------
const getState = os
    .output(WindowStateSchema.nullable())
    .handler(({ context }): WindowState | null => {
        const ctx = context as RpcContext;
        const win = BrowserWindow.fromId(ctx.project.wid);
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

// ---------- 切换开发者工具 ----------
const toggleDevtools = os
    .handler(async ({ context }) => {
        const ctx = context as RpcContext;
        const win = BrowserWindow.fromId(ctx.project.wid);
        if (win && win.webContents) {
            win.webContents.toggleDevTools();
        } else {
            throwPrecondition("无法定位窗口对象。")
        }
    });

// ---------- 新建窗口 ----------
const newwin = os
    .input(z.void())
    .output(z.boolean())
    .handler(async (): Promise<boolean> => {
        const win = await WindowService.instance.createWindow();
        if (win) {
            WindowService.instance.showWindow(win);
            return true;
        }
        return false;
    })

// ---------- 请求显示主窗口（关闭 splash） ----------
/**
 * renderer 主动调用：告诉主进程"我准备好了，可以显示窗口了"。
 *
 * 与 reveal 相关的所有兜底逻辑都在主进程 WindowService 内：
 *   - ready-to-show 4s 后 renderer 仍不 reveal → 强制 reveal
 *   - 15s 硬超时 → 强制 reveal
 *   - 主窗口 closed → 关闭 splash
 *
 * 因此 renderer 侧**只调用一次即可**，不需要无限重试；即使调用失败，
 * 主进程也有兜底，不会让用户永远停在 splash。
 *
 * 参数：
 *   reason - 可选；写入主进程日志用于诊断（推荐 "App.svelte:onMount" 这种前缀）。
 * 返回：
 *   boolean - true = 请求已登记（不代表窗口已显示）；false = 窗口已销毁。
 */
const reveal = os
    .input(z.object({ reason: z.string().optional() }).optional())
    .output(z.boolean())
    .handler(({ context, input }): boolean => {
        const ctx = context as RpcContext;
        const win = BrowserWindow.fromId(ctx.project.wid);
        if (!win || win.isDestroyed()) return false;
        return WindowService.instance.reveal(win, input?.reason ?? "renderer");
    });

export default {
    max,
    min,
    restore,
    show,
    focus,
    close,
    getState,
    toggleDevtools,
    newwin,
    reveal,
}