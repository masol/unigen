import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { BrowserWindow, ipcMain } from 'electron';
import { RPCHandler } from '@orpc/server/message-port';
import { onError } from '@orpc/server';
import { appRouter } from '$services/index.js';
import log from 'electron-log/main';

class OrpcModule implements AppModule {
    readonly #router: typeof appRouter;

    constructor({ router }: { router: typeof appRouter }) {
        this.#router = router;
    }

    enable({ app }: ModuleContext): void {
        const handler = new RPCHandler(this.#router, {
            interceptors: [
                onError((error) => {
                    log.error('oRPC Server Error:', error);
                }),
            ],
        });

        app.whenReady().then(() => {
            ipcMain.on('start-orpc-server', async (event) => {
                const [serverPort] = event.ports;
                handler.upgrade(serverPort);
                serverPort.start();
            });

            ipcMain.handle('get-window-id', (event) => {

                // event.sender corresponds to the webContents of the requesting window
                // const webContentsId = event.sender.id;

                // Find the parent BrowserWindow that owns this webContents
                const win = BrowserWindow.fromWebContents(event.sender);


                console.log("win=", win?.id)

                const wintest = BrowserWindow.fromId(Number(win?.id));
                console.log(wintest)

                // Return the native Electron Window ID (or fallback to webContentsId)
                return win?.id;

            });
        });
    }
}

export function orpcModule(...args: ConstructorParameters<typeof OrpcModule>) {
    return new OrpcModule(...args);
}
