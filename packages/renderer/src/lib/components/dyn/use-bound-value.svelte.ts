// src/lib/components/dyn/use-bound-value.svelte.ts
import { onDestroy } from "svelte";
import type {
    ChangePayload,
    IValueService,
    Unsubscribe,
    ValueSnapshot,
} from "../../store/ui/activity/type";

/**
 * 绑定单个 key 的响应式快照。
 * 用法（在组件 <script> 顶层，非条件分支中调用）：
 *
 *   const bound = useBoundValue(service, () => node.binding.readKey);
 *   let value = $derived(bound.snapshot.value);
 *   let loading = $derived(bound.snapshot.loading);
 *
 * 内部：
 *  - 订阅 onChange，首帧由 service 推送 loading→value。
 *  - key 变化时自动重订阅。
 *  - 组件销毁时自动注销。
 */
export function useBoundValue<T = unknown>(
    service: IValueService,
    keyFn: () => string | undefined,
) {
    const state = $state<{ snapshot: ValueSnapshot<T> }>({
        snapshot: { value: undefined, loading: true, error: null },
    });

    let unsub: Unsubscribe | null = null;
    let boundKey: string | undefined;

    function teardown() {
        if (unsub) {
            unsub();
            unsub = null;
        }
    }

    function bind(key: string | undefined) {
        teardown();
        boundKey = key;
        if (!key) {
            state.snapshot = { value: undefined, loading: false, error: null };
            return;
        }
        // 先给出已知快照，避免闪烁
        const initial = service.getState<T>(key);
        state.snapshot = initial;

        unsub = service.onChange<T>(key, (p: ChangePayload<T>) => {
            const prev = state.snapshot;
            state.snapshot = {
                value: "value" in p ? p.value : prev.value,
                loading: p.loading ?? false,
                error: p.error ?? null,
            };
        });
    }

    // key 变化时重新绑定
    $effect(() => {
        const key = keyFn();
        if (key !== boundKey) bind(key);
    });

    onDestroy(teardown);

    return state; // 访问 state.snapshot
}