
// ==========================================
// 1. 定义全局的 AsyncLocalStorage 实例.专用于API.
// ==========================================

import { AlsStore } from "$types/shared/api.js";
import { AsyncLocalStorage } from "async_hooks";
import { ORPCError, os } from "@orpc/server";
import { RpcContext } from "./type.js";
import { type ProjectContainer } from "$libs/project/project.js";
import { COMMON_ORPC_ERROR_DEFS } from '@orpc/client';


const asyncLocalStorage = new AsyncLocalStorage<AlsStore>();
// ==========================================
// 2. 创建全局 ALS 拦截/注入中间件
// ==========================================
export const alsMiddleware = os.middleware(async ({ context, next }) => {
    // 每次渲染进程窗口触发调用时，提取静态的 context.project 并包装成 ALS Store
    const ctx = context as RpcContext;
    const store: AlsStore = {
        project: ctx?.project,
        traceId: crypto.randomUUID() // 顺便生成一个链路追踪 ID，方便记日志
    };

    // 使用 run 方法包裹，将 store 注入到这一层以及后续所有的同步/异步调用链中
    return asyncLocalStorage.run(store, async () => {
        return await next();
    });
});


// ==========================================
// 4. 便捷的上下文获取工具函数 (方便底层 libs 代码随时调用)
// ==========================================
export function getCurrentProject(): ProjectContainer | undefined {
    const store = asyncLocalStorage.getStore();
    return store?.project;
}

export function ensureCurrentPrj(): ProjectContainer {
    const prj = getCurrentProject();
    if (!prj) {
        throw new ORPCError(COMMON_ORPC_ERROR_DEFS.NOT_FOUND.message, {
            status: COMMON_ORPC_ERROR_DEFS.TOO_MANY_REQUESTS.status,
            message: "无法获取到当前活动项目，没有通过Orpc接口驱动？"
        })
    }
    return prj
}