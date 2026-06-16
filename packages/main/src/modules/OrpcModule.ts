import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../types/ModuleContext.js';
import { BrowserWindow, ipcMain, type MessagePortMain } from 'electron';
import { getOrpcHandler } from '../api/index.js';
import { projectManager } from '$libs/project/manager.js';
import Logger from 'electron-log';

class OrpcModule implements AppModule {
    private windowPortsMap = new Map<number, MessagePortMain>();
    enable({ app }: ModuleContext): void {
        app.whenReady().then(() => {
            ipcMain.on('start-orpc-server', async (event) => {
                // Logger.error("start-orpc-server")
                const handler = getOrpcHandler()
                const win = BrowserWindow.fromWebContents(event.sender);
                if (!win?.id) {
                    const msg = "构建oRPC通路时，无法获取window."
                    Logger.error(msg);
                    throw new Error(msg);
                }
                const [serverPort] = event.ports;

                // 【防御性代码】如果该窗口之前已经注册过端口，先关闭旧端口，释放内存
                if (this.windowPortsMap.has(win.id)) {
                    const oldPort = this.windowPortsMap.get(win.id);
                    oldPort?.close(); // 关闭旧管道
                    Logger.error(`清理窗口 ${win.id} 的旧 oRPC 通道，请检查是否多次初始化oRPC了。`);
                }

                // 缓存当前新端口
                this.windowPortsMap.set(win.id, serverPort);


                // 当窗口销毁时，直接关闭这个专属的 serverPort
                win.once('closed', () => {
                    const port = this.windowPortsMap.get(win.id);
                    if (port) {
                        port.close();
                        this.windowPortsMap.delete(win.id);
                        Logger.info(`窗口 ${win.id} 已关闭，成功释放 oRPC 通道`);
                    }
                });

                // handler.upgrade 的行为是针对这个窗口（准确地说是针对传入的该窗口的 serverPort 通道）的，它不是全局覆盖。see https://orpc.dev/docs/adapters/electron
                handler.upgrade(serverPort, {
                    context: {
                        project: projectManager.ensureProject(win?.id)
                    },
                });
                serverPort.start();
            });

            ipcMain.handle('get-window-id', (event) => {

                // event.sender corresponds to the webContents of the requesting window
                // const webContentsId = event.sender.id;

                // Find the parent BrowserWindow that owns this webContents
                const win = BrowserWindow.fromWebContents(event.sender);


                BrowserWindow.fromId(Number(win?.id));

                // Return the native Electron Window ID (or fallback to webContentsId)
                return win?.id;

            });
        });
    }
}

export function orpcModule(...args: ConstructorParameters<typeof OrpcModule>) {
    return new OrpcModule(...args);
}
