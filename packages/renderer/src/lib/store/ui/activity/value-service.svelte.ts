// src/lib/components/dyn/input-value-service.ts
/**
 * ValueService 实现：纯数据传输原语，不认识任何业务数据结构。
 *  - 普通值：按 key，走 api().project.get/set/rm。
 *  - 文件资源：按 dir，走 api().project.listMetaRes/addMetaRes/rmMetaRes。
 *
 * 订阅：首个监听者时 addSubscribe(key)；无监听者时 rmSubscribe(key)。
 * main 变更通过外部调用 onKvChanged(key, value) 推入，service 内部路由 + 判等。
 *
 * 防循环：onKvChanged → #onRemoteKey：回声抑制(lastLocalWrite) + 值判等(snapshot)。
 */
import { api } from "$lib/utils/api";
import log from "electron-log/renderer";
import { getErrorMessage, isEqual } from "radashi";
import { toast } from "svelte-sonner";
import type {
    ChangePayload,
    IValueService,
    Unsubscribe,
    ValueSnapshot,
} from "./type";

interface KeyEntry {
    snapshot: ValueSnapshot;
    listeners: Set<(p: ChangePayload) => void>;
    subscribed: boolean;
    /** 回声抑制：最近一次本地写入的值（一次性） */
    lastLocalWrite?: unknown;
    hasLocalWrite: boolean;
}

interface DirEntry {
    snapshot: ValueSnapshot<string[]>;
    listeners: Set<(p: ChangePayload<string[]>) => void>;
}

export class ValueService implements IValueService {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    #keys = new Map<string, KeyEntry>();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    #dirs = new Map<string, DirEntry>();

    #isLoading = $state(false);
    #error = $state<string | null>(null);
    get isLoading() {
        return this.#isLoading;
    }
    get error() {
        return this.#error;
    }

    /* ════════════ 普通值：key 维度 ════════════ */

    #keyEntry(key: string): KeyEntry {
        let e = this.#keys.get(key);
        if (!e) {
            e = {
                snapshot: { value: undefined, loading: true, error: null },
                // eslint-disable-next-line svelte/prefer-svelte-reactivity
                listeners: new Set(),
                subscribed: false,
                hasLocalWrite: false,
            };
            this.#keys.set(key, e);
        }
        return e;
    }

    #emitKey(key: string, patch: Partial<ValueSnapshot>) {
        const e = this.#keyEntry(key);
        e.snapshot = { ...e.snapshot, ...patch };
        const p: ChangePayload = { ...e.snapshot };
        for (const cb of e.listeners) cb(p);
    }

    async #loadKey(key: string) {
        this.#emitKey(key, { loading: true, error: null });
        try {
            const value = await api().project.get(key);
            this.#emitKey(key, { value, loading: false, error: null });
        } catch (err) {
            const errMsg = getErrorMessage(err);
            this.#emitKey(key, { loading: false, error: errMsg });
            const msg = `[VS] loadKey “${key}” failed: ${errMsg}`
            log.error(msg);
            toast.error(msg);
        }
    }

    /** 外部（宿主）调用：main 侧某 key 变更 */
    onKvChanged(key: string, value: unknown): void {
        const e = this.#keys.get(key);
        // 无 entry / 无活跃监听：忽略（rm 或从未订阅）
        if (!e || e.listeners.size === 0) return;

        // ① 回声抑制：与自己刚写入的相等 → 丢弃（一次性）
        if (e.hasLocalWrite && isEqual(value, e.lastLocalWrite)) {
            e.hasLocalWrite = false;
            e.lastLocalWrite = undefined;
            log.debug(`[VS] echo suppressed: ${key}`);
            return;
        }
        // ② 值判等兜底：与当前快照相等 → 丢弃
        if (isEqual(value, e.snapshot.value)) return;

        this.#emitKey(key, { value, loading: false, error: null });
    }

    get<T = unknown>(key: string): T | undefined {
        return this.#keys.get(key)?.snapshot.value as T | undefined;
    }

    getState<T = unknown>(key: string): ValueSnapshot<T> {
        return this.#keyEntry(key).snapshot as ValueSnapshot<T>;
    }

    async fetch<T = unknown>(key: string): Promise<T | undefined> {
        return (await api().project.get(key)) as T | undefined;
    }

    onChange<T = unknown>(
        key: string,
        cb: (p: ChangePayload<T>) => void,
    ): Unsubscribe {
        const e = this.#keyEntry(key);
        e.listeners.add(cb as (p: ChangePayload) => void);
        if (!e.subscribed) {
            e.subscribed = true;
            api().project.addSubscribe(key);
            void this.#loadKey(key);
        } else {
            cb({ ...(e.snapshot as ValueSnapshot<T>) });
        }
        return () => {
            e.listeners.delete(cb as (p: ChangePayload) => void);
            if (e.listeners.size === 0 && e.subscribed) {
                e.subscribed = false;
                api().project.rmSubscribe(key);
            }
        };
    }

    async set(key: string, value: unknown): Promise<void> {
        const e = this.#keyEntry(key);
        e.lastLocalWrite = value;
        e.hasLocalWrite = true;
        try {
            await api().project.set({ key, value });
            this.#emitKey(key, { value, loading: false, error: null });
        } catch (err) {
            const errMsg = getErrorMessage(err);
            this.#emitKey(key, { error: errMsg });
            const msg = `[VS] set ${key} failed:${errMsg}`
            log.error(msg);
            toast.error(msg);
            // throw err;
        }
    }

    async rm(key: string): Promise<void> {
        const e = this.#keyEntry(key);
        e.lastLocalWrite = undefined;
        e.hasLocalWrite = false;
        try {
            await api().project.rm(key);
        } catch (err) {
            const errMsg = getErrorMessage(err);
            this.#emitKey(key, { error: errMsg });
            const msg = `[VS] rm ${key} failed:${errMsg}`
            log.error(msg);
            toast.error(msg);
        }
    }

    /* ════════════ 文件资源：dir 维度（无变更通知） ════════════ */

    #dirEntry(dir: string): DirEntry {
        let e = this.#dirs.get(dir);
        if (!e) {
            e = {
                snapshot: { value: undefined, loading: true, error: null },
                // eslint-disable-next-line svelte/prefer-svelte-reactivity
                listeners: new Set(),
            };
            this.#dirs.set(dir, e);
        }
        return e;
    }

    #emitDir(dir: string, patch: Partial<ValueSnapshot<string[]>>) {
        const e = this.#dirEntry(dir);
        e.snapshot = { ...e.snapshot, ...patch };
        const p: ChangePayload<string[]> = { ...e.snapshot };
        for (const cb of e.listeners) cb(p);
    }

    async #loadDir(dir: string) {
        this.#emitDir(dir, { loading: true, error: null });
        try {
            const value = (await api().project.listMetaRes(dir)) ?? [];
            this.#emitDir(dir, { value, loading: false, error: null });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.#emitDir(dir, { loading: false, error: msg });
            log.error(`[VS] loadDir ${dir} failed`, err);
            toast.error("msg");
        }
    }

    async fileList(dir: string): Promise<string[]> {
        return (await api().project.listMetaRes(dir)) ?? [];
    }

    async fileAdd(dir: string, paths: string[]): Promise<string[]> {
        const e = this.#dirEntry(dir);
        const added = await api().project.addMetaRes({ dir, paths });
        const next = [...((e.snapshot.value as string[]) ?? []), ...added];
        this.#emitDir(dir, { value: next });
        return added;
    }

    async fileRemove(dir: string, paths: string[]): Promise<void> {
        const e = this.#dirEntry(dir);
        await api().project.rmMetaRes({ dir, paths });
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const set = new Set(paths);
        const next = ((e.snapshot.value as string[]) ?? []).filter(
            (p) => !set.has(p),
        );
        this.#emitDir(dir, { value: next });
    }

    onFileChange(
        dir: string,
        cb: (p: ChangePayload<string[]>) => void,
    ): Unsubscribe {
        const e = this.#dirEntry(dir);
        e.listeners.add(cb);
        if (e.listeners.size === 1) {
            void this.#loadDir(dir); // 无 main 订阅，仅本地驱动
        } else {
            cb({ ...e.snapshot });
        }
        return () => {
            e.listeners.delete(cb);
        };
    }
}

// export const inputValueService = new ValueService();