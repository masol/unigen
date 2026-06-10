import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import type { AppClient } from '@app/main/types'
import evtbus from './evt'
import { destr } from "destr";
import { isPlainObject } from 'radashi';

export function initApi(): AppClient {

    const { port1: clientPort, port2: serverPort } = new MessageChannel()
    window.postMessage('start-orpc-client', '*', [serverPort])

    console.log(1223444, clientPort)
    const link = new RPCLink({
        port: clientPort,
    })

    clientPort.start();
    // Or, create a client using a contract
    const client: AppClient = createORPCClient(link);

    console.log("client=", client);
    console.log("asdfsd", client.test.test)
    // const result = await client.test.test('123');
    // console.log("result=", result)
    console.log("asdf")
    return client;
}

let windowsId: number = -1;
export async function setupEvt() {
    await window.onNotification((evt, msg) => {
        void (evt)
        const msgObj: Record<string, unknown> = destr(msg);
        if (isPlainObject(msgObj) && msgObj.evtName) {
            // @ts-expect-error 忽略类型推理
            evtbus.emit(msgObj.evtName, msgObj.data);
        }
    })
    windowsId = await window.getWindowId();
}

export const wid = (): number => windowsId;

let client: AppClient;
export const api = (): AppClient => {
    if (!client) {
        client = initApi();
    }
    return client;
};
