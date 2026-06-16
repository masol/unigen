import { onError, os } from "@orpc/server";
import window from './window.js'
import plugin from './plugin.js'
import { RPCHandler } from "@orpc/server/message-port";
import Logger from "electron-log";
import { RpcContext } from "./type.js";

// 注意，本地实现只是adapter,真实的实现代码都要放到libs对应代码中，这里只为客户端服务。
const appRouter = os.router({
    plugin,
    window
});

export type AppRouter = typeof appRouter

let handler: RPCHandler<RpcContext> | undefined;

export function getOrpcHandler(): RPCHandler<RpcContext> {
    if (!handler) {
        handler = new RPCHandler<RpcContext>(appRouter, {
            interceptors: [
                onError((error, context) => {
                    Logger.error('oRPC Server Error:', error, context);
                }),
            ],
        });
    }
    return handler;
}
