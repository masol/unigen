import { NotifyContract } from "$types/index.js";
import { BrowserWindow } from "electron";


const NotifyChannelName = "ug-notification";
/**
  * 通知：触发事件 → 通过 IPC 通知renderer
  */
export function notify(win: BrowserWindow, evtName: string, payload: unknown, srcId = -1): void {
    // 1. 通过 IPC 发送给renderer（webContents 可能已销毁）
    if (!win.isDestroyed() && win.webContents) {
        const evt: NotifyContract = {
            name: evtName,
            srcId,
            payload,
        };
        win.webContents.send(NotifyChannelName, evt);
    }
}

export function broadcast(evt: NotifyContract): void {
    BrowserWindow.getAllWindows().forEach((win) => {
        // 1. 通过 IPC 发送给renderer（webContents 可能已销毁）
        if (!win.isDestroyed() && win.webContents) {
            win.webContents.send(NotifyChannelName, evt);
        }
    });
}