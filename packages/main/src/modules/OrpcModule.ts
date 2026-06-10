import type { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { ipcMain } from 'electron';
import { RPCHandler } from '@orpc/server/message-port';
import { onError } from '@orpc/server';
import { serviceRouter } from '$services/index.js';
import log from 'electron-log/main';

class OrpcModule implements AppModule {
    readonly #router: typeof serviceRouter;

    constructor({ router }: { router: typeof serviceRouter }) {
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
        });
    }
}

export function orpcModule(...args: ConstructorParameters<typeof OrpcModule>) {
    return new OrpcModule(...args);
}
