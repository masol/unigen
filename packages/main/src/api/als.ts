
// ==========================================
// 1. 定义全局的 AsyncLocalStorage 实例.专用于API.
// ==========================================

import { AlsStore } from "$types/shared/api.js";
import { AsyncLocalStorage } from "async_hooks";
import { os } from "@orpc/server";
import { RpcContext } from "./type.js";


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
export function getCurrentProject() {
    const store = asyncLocalStorage.getStore();
    return store?.project;
}
