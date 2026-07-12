// src/lib/components/dyn/binding.svelte.ts
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 绑定机制（Binding）——动态面板节点与数据层之间的唯一契约。          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * track 语义：
 *  - 缺省（false）：本组件是该 key 的唯一变更源。onMount 读一次，之后 set()
 *    自己乐观更新本地状态，不订阅 service —— 最简单也最可靠。
 *  - true：别人（main 静默变更 / 其它 UI 组件）也可能改它，订阅 service，
 *    任何来源的变更都会刷新本组件。
 */

import type { IValueService, Unsubscribe } from "$lib/store/ui/activity/type";
import { onDestroy } from "svelte";

/** 值绑定：声明节点读写数据层的哪个 key，及其行为。 */
import type { Binding } from "@app/main/types";

export interface BoundHandle<T = unknown> {
    readonly value: T | undefined;
    readonly loading: boolean;
    readonly error: string | null;
    readonly readonly: boolean;
    set(next: unknown): Promise<boolean>;
}

/**
 * 组件侧「缓冲」由此 hook 持有（service 不缓冲）。
 * 必须在组件 <script> 顶层、非条件分支调用。
 */
export function useBinding<T = unknown>(
    service: IValueService,
    bindingFn: () => Binding,
): BoundHandle<T> {
    const st = $state<{
        value: T | undefined;
        loading: boolean;
        error: string | null;
    }>({ value: undefined, loading: true, error: null });

    let unsub: Unsubscribe | null = null;
    let boundKey: string | undefined;
    let gen = 0; // 重绑定 / 卸载 竞态守卫

    function teardown() {
        unsub?.();
        unsub = null;
    }

    function bind(b: Binding) {
        teardown();
        boundKey = b.key;
        const myGen = ++gen;

        // 空 key：不读、不订阅
        if (!b.key) {
            st.value = undefined;
            st.loading = false;
            st.error = null;
            return;
        }

        st.value = undefined;
        st.loading = true;
        st.error = null;

        // track 时才订阅外部变更；否则完全不监听 service。
        let gotLive = false;
        if (b.track === true) {
            unsub = service.subscribe<T>(b.key, (value) => {
                if (myGen !== gen) return;
                gotLive = true;
                st.value = value;
                st.loading = false;
                st.error = null;
            });
        }

        // 首帧：直接读最新值。若期间已有订阅推送到达，则不用较旧的 get 覆盖。
        void service
            .get<T>(b.key)
            .then((value) => {
                if (myGen !== gen || gotLive) return;
                st.value = value;
                st.loading = false;
            })
            .catch((e) => {
                if (myGen !== gen) return;
                st.loading = false;
                st.error = e instanceof Error ? e.message : String(e);
            });
    }

    // binding.key 变化时重绑
    $effect(() => {
        const b = bindingFn();
        if (b.key !== boundKey) bind(b);
    });

    onDestroy(teardown);

    return {
        get value() {
            return st.value;
        },
        get loading() {
            return st.loading;
        },
        get error() {
            return st.error;
        },
        get readonly() {
            return bindingFn().readonly ?? false;
        },
        async set(next: unknown) {
            const b = bindingFn();
            if (b.readonly) return false;
            await service.set(b.key, next);
            // 唯一变更源（未订阅）：service 不会回流给自己，这里乐观更新。
            // 已订阅（track）：service 回流会再设一次同值，无副作用。
            if (myGenIsCurrent()) {
                st.value = next as T;
                st.loading = false;
                st.error = null;
            }
            return true;
        },
    };

    function myGenIsCurrent() {
        return boundKey !== undefined;
    }
}

/* ── 安全读取工具（作用于绑定值，兜底）——本模块为唯一来源 ── */

export function coerceString(v: unknown): string {
    return typeof v === "string" ? v : "";
}
export function coerceStringOr(v: unknown, fallback: string): string {
    return typeof v === "string" && v.length > 0 ? v : fallback;
}
export function coerceList<T = unknown>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}