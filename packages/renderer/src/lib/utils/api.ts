import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import type { AppClient } from '@app/main/types'
import evtbus from './evtbus'
import { destr } from "destr";
import { isPlainObject } from 'radashi';

export function initApi(): AppClient {

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

// let windowsId: number = -1;
export async function setupEvt(): Promise<number> {
    await window.onNotification((evt, msg) => {
        console.log("on notify,", evt, msg)
        void (evt)
        const msgObj: Record<string, unknown> = destr(msg);
        if (isPlainObject(msgObj) && msgObj.evtName) {
            // @ts-expect-error 忽略类型推理
            evtbus.emit(msgObj.evtName, msgObj.data);
        }
    })
    return await window.getWindowId();
    // return windowsId;
}

// export const wid = (): number => windowsId;

let client: AppClient;
export const api = (): AppClient => {
    if (!client) {
        client = initApi();
    }
    return client;
};
