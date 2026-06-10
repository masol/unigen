import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import type { ApiContract } from '../../types/api'
// import {type ServiceRouter} from '@app/main'
// contract.ts
import { oc } from "@orpc/contract";
import { z } from "zod";

export const apiContract = {
    test: {
        test: oc
            .input(z.string())
            .output(z.string()),
    },
};

let client: ApiContract;

export async function initApi() {

    const { port1: clientPort, port2: serverPort } = new MessageChannel()
    window.postMessage('start-orpc-client', '*', [serverPort])

    console.log(1223444, clientPort)
    const link = new RPCLink({
        port: clientPort,
    })

    clientPort.start();
    // Or, create a client using a contract
    client = createORPCClient(link) as unknown as ApiContract;

    console.log("client=", client);
    console.log("asdfsd", client.test.test)
    const result = await client.test.test('123');
    console.log("result=", result)
    console.log("asdf")
}

export const api = () => client;
