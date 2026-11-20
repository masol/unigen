// evtbus.ts
import type { AppConfig, RecentProject, WindowEventPayload } from '@app/main/types';
import mitt, { type Emitter } from "mitt";

/**
 * 启动过程阶段。与 main 侧 StartupPhase 保持一致。
 */
export type StartupPhase =
    | "starting"
    | "app-ready"
    | "search-db"
    | "search-sync"
    | "embedding"
    | "rerank"
    | "mcp"
    | "ready"
    | "failed";

export interface StartupWarning {
    /** 稳定 id，用于去重 */
    id: string;
    level: "info" | "warn" | "error";
    code: string;
    message: string;
    detail?: string;
    timestamp: number;
}

export interface StartupProgress {
    phase: StartupPhase;
    message: string;
    /** 0 ~ 100 */
    progress: number;
    warnings: StartupWarning[];
    timestamp: number;
}

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
    "task_finished": { success: boolean, reason?: string, seq: number } // 任务结束，启动时间。    
    "clarify": { uuid: string, question: string, mode?: string, options?: string[] }, // 请求用户澄清,在projectStore处理。
    "runcommand-end": { suc: boolean, seq: number }
    "toast": { type: string, msg: string },
    "recent:projects": RecentProject[]
    "kv-changed": { key: string, value: unknown }
    "before-input-evt": {
        key: string;
        ctrlKey: boolean;
        metaKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
    },
    "switch-session": { state: "start" | "failed" } // 切换session.

    // ── 启动进度 / 警告 ────────────────────────────────────
    /** 启动进度快照（每阶段更新一次） */
    "startup:progress": StartupProgress;
    /** 新增一条启动/运行期警告 */
    "startup:warning": StartupWarning;
};

export type EventNameType = keyof Events;

/**
 * 2. 内部包装类：封装底层 mitt 的操作
 */
class EventBus {
    private _emitter: Emitter<Events> = mitt<Events>();

    on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void) {
        this._emitter.on(event, handler);
    }

    once<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void) {
        let called = false;
        const wrapped = (payload: Events[K]) => {
            if (called) return;
            called = true;
            try {
                handler(payload);
            } finally {
                this._emitter.off(event, wrapped);
            }
        };
        this._emitter.on(event, wrapped);
    }

    off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void) {
        this._emitter.off(event, handler);
    }

    offAll<K extends keyof Events>(event: K) {
        this._emitter.off(event);
    }

    emit<K extends keyof Events>(event: K, payload: Events[K]) {
        this._emitter.emit(event, payload);
    }
}

/**
 * 3. 基于 Symbol.for 的全局单例挂载
 */
const KEY = Symbol.for('unigen.renderer.evtbus');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const evtbus: EventBus = ((globalThis as any)[KEY] ??= new EventBus());

export type Evtbus = EventBus;

export default evtbus;