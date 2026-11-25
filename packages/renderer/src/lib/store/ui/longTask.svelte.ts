// src/lib/store/ui/longTask.svelte.ts
import { taskProgressStore } from '$lib/store/task-progress.svelte';
import log from 'electron-log/renderer';
import { SvelteMap } from 'svelte/reactivity';

type CountFn = () => number;

/**
 * 长时任务汇总。
 *
 * 目的：CSS 角标的数据源解耦。
 *  - 各模块（代码环境安装、自有环境初始化等）注册一个只读计数函数；
 *  - UI（活动栏入口、设置子项）只查询汇总，不耦合具体模块；
 *  - 数据源移除后自动消失，避免僵尸计数。
 *
 * 约定：所有注册的 `getCount` 函数**必须是**响应式函数（读取 `$state` /
 * `SvelteMap` 等），否则 total 不会随其值变化自动重算。
 */
class LongTaskStore {
    #sources = $state<SvelteMap<string, CountFn>>(new SvelteMap());

    /** 所有注册任务源之和 */
    readonly total = $derived.by(() => {
        let sum = 0;
        for (const fn of this.#sources.values()) {
            const v = fn();
            if (Number.isFinite(v) && v > 0) sum += Math.trunc(v);
        }
        return sum;
    });

    /**
     * 注册一个任务源；返回取消函数。
     * 同一 key 重复注册会覆盖旧值。
     */
    register(key: string, getCount: CountFn): () => void {
        if (this.#sources.has(key)) {
            log.warn(`[LongTaskStore] register() overwritten: key=${key}`);
        }
        this.#sources.set(key, getCount);
        return () => {
            this.#sources.delete(key);
        };
    }

    init() {
        if (!this.has("code-runtime")) {
            this.registerTaskPrefix("code-runtime", "code-runtime:");
        }
        if (!this.has("search")) {
            // 全文索引重建 / 向量重建，见 packages/main/src/libs/searchsrv/task-ids.ts
            this.registerTaskPrefix("search", "search:");
        }
    }

    /**
     * 便捷注册：以 `taskProgressStore` 中任务 id 前缀汇总。
     *
     * 适用于主进程通过 `task:update` 广播进度、且所有任务共享同一 id 前缀
     * 的场景（例如 `code-runtime:python` / `code-runtime:nodejs`）。
     *
     * 只统计 `pending` / `running`，因此任务完成后角标会自动消失。
     */
    registerTaskPrefix(key: string, prefix: string): () => void {
        return this.register(key, () => {
            const all = taskProgressStore.all;
            let count = 0;
            for (const task of all) {
                if (!task.id.startsWith(prefix)) continue;
                if (task.status !== 'pending' && task.status !== 'running') {
                    continue;
                }
                count++;
            }
            return count;
        });
    }

    /**
     * 某来源当前长时任务数；未注册返回 0。
     * 在派生 / 模板中调用时，内部响应式会被追踪。
     */
    countFor(key: string): number {
        const fn = this.#sources.get(key);
        if (!fn) return 0;
        const v = fn();
        return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
    }

    has(key: string): boolean {
        return this.#sources.has(key);
    }
}

const KEY = Symbol.for('unigen.renderer.longTaskStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const longTaskStore: LongTaskStore = ((globalThis as any)[KEY] ??=
    new LongTaskStore());