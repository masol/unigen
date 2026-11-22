/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hookable, type HookCallback } from 'hookable';

/**
 * Hookable 的 HookCallback 签名约束为 `(...args: any[]) => void | Promise<void>`，
 * 因此在内部包装时需要把 `Promise<unknown>` 适配为 `Promise<void>`。
 * 包装层返回 `() => void` 的 unregister 函数，对外屏蔽 hookable 的细节。
 *
 * 关于并行/串行的说明：
 * hookable 的 `callHook` 是**串行** await 的（按注册顺序），这是 hookable 的默认语义；
 * 需要并行语义时必须显式调用 `callHookParallel`（需 hookable >= 5.4.0）。
 * 因此：
 * - AsyncParallelHook.promise() 使用 callHookParallel
 * - AsyncSeriesHook.promise() 使用 callHook
 */

export type AsyncCallback = (...args: any[]) => Promise<unknown> | unknown;

type Unregister = () => void;

/**
 * 内部辅助：管理同一 name 多次注册所对应的 unregister 函数集合。
 * - 修复了旧实现对 `untap(name)` 的 no-op 问题。
 * - 同名多次注册时，支持一次性全部清理。
 */
class UnregisterRegistry {
    readonly #byName = new Map<string, Set<Unregister>>();

    add(name: string, rawUnregister: Unregister): Unregister {
        const set = this.#byName.get(name) ?? new Set<Unregister>();
        set.add(rawUnregister);
        this.#byName.set(name, set);

        // 返回"幂等"的 unregister 函数：内部集合与 hookable 都清理干净
        return () => {
            set.delete(rawUnregister);
            if (set.size === 0) this.#byName.delete(name);
            rawUnregister();
        };
    }

    removeByName(name: string): void {
        const set = this.#byName.get(name);
        if (!set) return;
        for (const u of set) u();
        this.#byName.delete(name);
    }

    clear(): void {
        for (const set of this.#byName.values()) {
            for (const u of set) u();
        }
        this.#byName.clear();
    }

    get size(): number {
        return this.#byName.size;
    }
}

function toVoidCallback<P extends any[]>(
    fn: (...args: P) => Promise<unknown>,
): HookCallback {
    return async (...a: any[]): Promise<void> => {
        await fn(...(a as P));
    };
}

/**
 * 异步并行 hook：tap 注册的所有回调并发执行，全部完成才算 promise 完成。
 * 底层通过 hookable 的 `callHookParallel` 实现（hookable 的默认 `callHook` 是串行，
 * 与本类命名不符，故不采用）。
 */
export class AsyncParallelHook<P extends any[] = any[]> {
    readonly #hooks: Hookable<Record<string, HookCallback>>;
    readonly #name: string;
    readonly #registry = new UnregisterRegistry();

    constructor(name?: string) {
        this.#hooks = new Hookable<Record<string, HookCallback>>();
        this.#name = name ?? `parallel_${Math.random().toString(36).slice(2)}`;
    }

    async promise(...args: P): Promise<void> {
        // callHookParallel：所有 hook 并发执行
        await this.#hooks.callHookParallel(this.#name, ...(args as any[]));
    }

    tapPromise(name: string, fn: (...args: P) => Promise<unknown>): Unregister {
        const wrapped = toVoidCallback(fn);
        const rawUnregister = this.#hooks.hook(this.#name, wrapped);
        return this.#registry.add(name, rawUnregister);
    }

    tap(name: string, fn: (...args: P) => unknown): Unregister {
        const wrapped: HookCallback = (...a: any[]): void => {
            fn(...(a as P));
        };
        const rawUnregister = this.#hooks.hook(this.#name, wrapped);
        return this.#registry.add(name, rawUnregister);
    }

    /**
     * 按注册名注销该名称下的**全部**回调（同名多次注册会被一起清掉）。
     * 通常推荐直接调用 `tap/tapPromise` 返回的 unregister；`untap` 适合
     * "任务级批量清理"场景（与 tapable 习惯保持一致）。
     */
    untap(name: string): void {
        this.#registry.removeByName(name);
    }

    /**
     * 清空本 hook 的所有回调。
     */
    untapAll(): void {
        this.#registry.clear();
        // 冗余但保险：确保 hookable 内部也彻底清空
        this.#hooks.clearHook(this.#name);
    }

    isUsed(): boolean {
        return this.#registry.size > 0;
    }
}

/**
 * 异步串行 hook：tap 注册的回调按注册顺序串行执行。
 * hookable 的默认 `callHook` 已经是串行语义，直接采用。
 */
export class AsyncSeriesHook<P extends any[] = any[]> {
    readonly #hooks: Hookable<Record<string, HookCallback>>;
    readonly #name: string;
    readonly #registry = new UnregisterRegistry();

    constructor(name?: string) {
        this.#hooks = new Hookable<Record<string, HookCallback>>();
        this.#name = name ?? `series_${Math.random().toString(36).slice(2)}`;
    }

    async promise(...args: P): Promise<void> {
        await this.#hooks.callHook(this.#name, ...(args as any[]));
    }

    tapPromise(name: string, fn: (...args: P) => Promise<unknown>): Unregister {
        const wrapped = toVoidCallback(fn);
        const rawUnregister = this.#hooks.hook(this.#name, wrapped);
        return this.#registry.add(name, rawUnregister);
    }

    tap(name: string, fn: (...args: P) => unknown): Unregister {
        const wrapped: HookCallback = (...a: any[]): void => {
            fn(...(a as P));
        };
        const rawUnregister = this.#hooks.hook(this.#name, wrapped);
        return this.#registry.add(name, rawUnregister);
    }

    untap(name: string): void {
        this.#registry.removeByName(name);
    }

    untapAll(): void {
        this.#registry.clear();
        this.#hooks.clearHook(this.#name);
    }

    isUsed(): boolean {
        return this.#registry.size > 0;
    }
}