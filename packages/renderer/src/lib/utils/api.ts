import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import type { AppClient, NotifyContract } from '@app/main/types'
import evtbus, { type Events } from './evtbus'
import { isPlainObject } from 'radashi';
import Logger from 'electron-log/renderer';

function initApi(): AppClient {

    const { port1: clientPort, port2: serverPort } = new MessageChannel()
    window.postMessage('start-orpc-client', '*', [serverPort])

    const link = new RPCLink({
        port: clientPort,
    })

    clientPort.start();
    // Or, create a client using a contract
    const client: AppClient = createORPCClient(link);
    return client;
}

let windowsId: number = -1;
export async function setupEvt(): Promise<number> {
    await window.onNotification((evt, msg) => {
        if (!isPlainObject(msg)) {
            Logger.error("收到无效的事件通知:", msg);
            return;
        }
        void (evt)
        const notyObj: NotifyContract = msg as unknown as NotifyContract;
        if (!notyObj.name) {
            Logger.error("收到无效的事件通知(不包含名称):", msg);
            return;
        }
        if (windowsId === -1) {
            return; // 尚未初始化。
        }
        if (notyObj.srcId === windowsId) {
            // 过滤自己发出的事件，不再通知回自己。
            Logger.debug(`过滤自己发出的事件，不再通知回自己。${JSON.stringify(notyObj)}`)
            return;
        }
        evtbus.emit(notyObj.name as keyof Events, notyObj.payload as never);
    })
    windowsId = await window.getWindowId();
    return windowsId;
}

// export const wid = (): number => windowsId;

let client: AppClient;
export const api = (): AppClient => {
    if (!client) {
        client = initApi();
    }
    return client;
};
