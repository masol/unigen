// src/lib/store/ui/activity/value-service.ts
/**
 * ValueService —— 纯数据传输原语，无缓冲、无快照。
 *  - 普通值：按 key，走 api().project.get/set/rm。
 *  - 文件资源：按 dir，走 api().project.listMetaRes/addMetaRes/rmMetaRes。
 *
 * 设计原则（重要）：
 *  - service 不持有任何值缓存。get 永远向 main 读最新值。
 *  - set/rm 成功后，把「新值」派发给该 key 的订阅者（跨组件回流）。
 *  - main 静默变更经宿主 onKvChanged 推入，同样派发给订阅者。
 *  - 是否订阅由组件侧决定：唯一变更源的组件可完全不订阅（自己乐观更新）。
 *
 * subscribe(key, cb)：
 *  - 注册 cb，并（首个订阅者时）向 main addSubscribe，接收 main 静默变更。
 *  - 无订阅者时删除 entry，无泄漏。
 */
import { api } from "$lib/utils/api";
import log from "electron-log/renderer";
import { getErrorMessage } from "radashi";
import { toast } from "svelte-sonner";
import type {
    FilesListener,
    IValueService,
    Unsubscribe,
    ValueListener,
} from "./type";

interface KeyEntry {
    listeners: Set<ValueListener>;
    subscribed: boolean; // 是否已 addSubscribe(main)
}

interface DirEntry {
    listeners: Set<FilesListener>;
}

export class ValueService implements IValueService {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    #keys = new Map<string, KeyEntry>();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    #dirs = new Map<string, DirEntry>();

    /* ════════════ 普通值：key 维度 ════════════ */

    #notify(key: string, value: unknown) {
        const e = this.#keys.get(key);
        if (!e) return;
        // 拷贝一份，避免回调内增删监听者导致迭代异常
        for (const cb of [...e.listeners]) cb(value);
    }

    /** 宿主调用：main 侧某 key 变更 → 直接派发原值 */
    onKvChanged(key: string, value: unknown): void {
        this.#notify(key, value);
    }

    async get<T = unknown>(key: string): Promise<T | undefined> {
        try {
            return (await api().project.get(key)) as T | undefined;
        } catch (err) {
            // 读失败只记日志并抛出；由调用方（hook）在 UI 内联展示 error，避免 toast 噪音。
            log.error(`[VS] get “${key}” failed: ${getErrorMessage(err)}`);
            throw err;
        }
    }

    async set<T = unknown>(key: string, value: T): Promise<void> {
        try {
            await api().project.set({ key, value });
            this.#notify(key, value); // 回流给订阅者（若有）
        } catch (err) {
            const msg = `[VS] set “${key}” failed: ${getErrorMessage(err)}`;
            log.error(msg);
            toast.error(msg);
            throw err; // 让调用方感知失败，避免基于"以为成功"的后续写入
        }
    }

    async rm(key: string): Promise<void> {
        try {
            await api().project.rm(key);
            this.#notify(key, undefined);
        } catch (err) {
            const msg = `[VS] rm “${key}” failed: ${getErrorMessage(err)}`;
            log.error(msg);
            toast.error(msg);
            throw err;
        }
    }

    subscribe<T = unknown>(key: string, cb: ValueListener<T>): Unsubscribe {
        let e = this.#keys.get(key);
        if (!e) {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            e = { listeners: new Set(), subscribed: false };
            this.#keys.set(key, e);
        }
        const entry = e;
        entry.listeners.add(cb as ValueListener);
        if (!entry.subscribed) {
            entry.subscribed = true;
            api().project.addSubscribe(key);
        }

        let done = false;
        return () => {
            if (done) return;
            done = true;
            entry.listeners.delete(cb as ValueListener);
            if (entry.listeners.size === 0) {
                if (entry.subscribed) api().project.rmSubscribe(key);
                this.#keys.delete(key);
            }
        };
    }

    /* ════════════ 文件资源：dir 维度 ════════════ */

    #dirEntry(dir: string): DirEntry {
        let e = this.#dirs.get(dir);
        if (!e) {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            e = { listeners: new Set() };
            this.#dirs.set(dir, e);
        }
        return e;
    }

    #notifyDir(dir: string, value: string[]) {
        const e = this.#dirs.get(dir);
        if (!e) return;
        for (const cb of [...e.listeners]) cb(value);
    }

    async fileList(dir: string): Promise<string[]> {
        return (await api().project.listMetaRes(dir)) ?? [];
    }

    async fileAdd(dir: string, paths: string[]): Promise<string[]> {
        try {
            const added = await api().project.addMetaRes({ dir, paths });
            // 不本地拼接，直接向 main 重拉，保证与真实一致
            this.#notifyDir(dir, await this.fileList(dir));
            return added;
        } catch (err) {
            const msg = `[VS] fileAdd “${dir}” failed: ${getErrorMessage(err)}`;
            log.error(msg);
            toast.error(msg);
            throw err;
        }
    }

    async fileRemove(dir: string, paths: string[]): Promise<void> {
        try {
            await api().project.rmMetaRes({ dir, paths });
            this.#notifyDir(dir, await this.fileList(dir));
        } catch (err) {
            const msg = `[VS] fileRemove “${dir}” failed: ${getErrorMessage(err)}`;
            log.error(msg);
            toast.error(msg);
            throw err;
        }
    }

    subscribeFiles(dir: string, cb: FilesListener): Unsubscribe {
        const e = this.#dirEntry(dir);
        e.listeners.add(cb);
        let done = false;
        return () => {
            if (done) return;
            done = true;
            e.listeners.delete(cb);
            if (e.listeners.size === 0) this.#dirs.delete(dir);
        };
    }
}