// evtbus.ts
// mitt + TypeScript 全局事件总线封装模板
// 安装依赖：npm install mitt
import type { AppConfig, WindowEventPayload } from '@app/main/types'
import mitt, { type Emitter } from "mitt";

/**
 * 1. 在这里定义你的事件映射类型
 *  key: 事件名（推荐用命名空间，如 "user:login"）
 *  value: 该事件对应的 payload 类型（void 表示无参数）
 */
export type Events = {
    "winstate": WindowEventPayload;
    "cfg:setall": AppConfig;
    "cfg:set": { name: string; value: unknown };
    "sys:usedark": boolean  // 更改了操作系统的深色/浅色模式。
    "lang:changed": string  // 更新了语言设置。
    "task_finished": { success: boolean, reason?: string } // 任务结束，启动时间。
    // 用户相关事件
    "user:login": { id: number; name: string; avatar?: string };
    "user:logout": void;
    "user:update": { id: number; fields: Partial<{ name: string; avatar: string }> };
};

export type EventNameType = keyof Events;

/**
 * 2. 创建 mitt 实例
 */
const _emitter: Emitter<Events> = mitt<Events>();

/**
 * 3. 封装为全局事件总线对象 evtbus
 *    在任意模块中导入使用：import evtbus from "./evtbus"
 */
const evtbus = {
    /**
     * 监听事件
     */
    on<K extends keyof Events>(
        event: K,
        handler: (payload: Events[K]) => void
    ) {
        return _emitter.on(event, handler);
    },

    /**
     * 一次性监听（触发一次后自动移除）
     */
    once<K extends keyof Events>(
        event: K,
        handler: (payload: Events[K]) => void
    ) {
        let called = false;
        const wrapped: typeof handler = (payload) => {
            if (called) return;
            called = true;
            handler(payload);
            _emitter.off(event, wrapped);
        };
        return _emitter.on(event, wrapped);
    },

    /**
     * 移除监听
     */
    off<K extends keyof Events>(
        event: K,
        handler: (payload: Events[K]) => void
    ) {
        return _emitter.off(event, handler);
    },

    /**
     * 移除某事件的所有监听（可选）
     */
    offAll<K extends keyof Events>(event: K) {
        _emitter.off(event);
    },

    /**
     * 触发事件
     */
    emit<K extends keyof Events>(
        event: K,
        payload: Events[K]
    ) {
        return _emitter.emit(event, payload);
    },
};

/**
 * 4. 导出全局事件总线对象
 */
export default evtbus;

export type Evtbus = typeof evtbus;

/**
 * 5. 使用示例（可直接在项目中使用）
 */

/*
// 在任意模块中导入
import evtbus from "./evtbus";

// 监听 user:login
evtbus.on("user:login", (user) => {
  // user 的类型自动推断为 { id: number; name: string; avatar?: string }
  console.log("用户登录:", user.name, user.id);*/