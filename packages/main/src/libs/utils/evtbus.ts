// src/main/evtbus.ts
import type { Emitter } from "mitt";
import * as mittNS from "mitt";

/**
 * mitt 工厂函数的兼容导入。
 *
 * 背景：mitt 3.x 是 ESM-only，`export default function mitt`。
 * 在 `module: "CommonJS"` 且未开启 `esModuleInterop`（默认 false）的 tsconfig 下，
 * `import mitt from "mitt"` 会被解析为模块命名空间，触发 TS2349（不可调用）。
 * 这里通过访问 `.default` 并在缺失时回退到命名空间本身，保证任何配置下都能拿到工厂函数。
 *
 * 如果主进程 tsconfig 开启了 `"esModuleInterop": true`，
 * 这段兜底可简化为 `import mitt from "mitt";`。
 */
type MittFactory = <Events extends Record<string | symbol, unknown>>() => Emitter<Events>;

const mitt: MittFactory = (
    (mittNS as unknown as { default?: MittFactory }).default ?? mittNS
) as MittFactory;

/**
 * 主进程事件映射。
 * 与 renderer 通过 IPC bridge 桥接的事件保持同名同 payload；
 * 主进程独有事件继续在此追加。
 */
export type MainEvents = {
    "embed-changed": { old: string | null, new: string | null };
};

export type MainEventName = keyof MainEvents;

class EventBus {
    private _emitter: Emitter<MainEvents> = mitt<MainEvents>();

    on<K extends keyof MainEvents>(event: K, handler: (payload: MainEvents[K]) => void) {
        this._emitter.on(event, handler);
    }

    once<K extends keyof MainEvents>(event: K, handler: (payload: MainEvents[K]) => void) {
        let called = false;
        const wrapped = (payload: MainEvents[K]) => {
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

    off<K extends keyof MainEvents>(event: K, handler: (payload: MainEvents[K]) => void) {
        this._emitter.off(event, handler);
    }

    offAll<K extends keyof MainEvents>(event: K) {
        this._emitter.off(event);
    }

    emit<K extends keyof MainEvents>(event: K, payload: MainEvents[K]) {
        this._emitter.emit(event, payload);
    }
}

/**
 * 主进程全局单例。
 * key 与 renderer 明确区分；globalThis 在主进程和渲染进程之间本来也不共享。
 */
const KEY = Symbol.for('unigen.main.evtbus');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const evtbus: EventBus = ((globalThis as any)[KEY] ??= new EventBus());

export type Evtbus = EventBus;

export default evtbus;