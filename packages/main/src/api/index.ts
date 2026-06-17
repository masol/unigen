import { onError, os } from "@orpc/server";
import window from './window.js';
import plugin from './plugin.js';
import { RPCHandler } from "@orpc/server/message-port";
import Logger from "electron-log";
import { RpcContext } from "./type.js";
import { alsMiddleware } from "./als.js";
import config from './cfg.js'


// ==========================================
// 3. 构建应用路由器（将中间件链条挂载到顶层）
// ==========================================
const appRouter = os
    .use(alsMiddleware) // 在最外层挂载中间件，使所有子路由（plugin, window）自动生效
    .router({
        plugin,
        window,
        config
    });

export type AppRouter = typeof appRouter;

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