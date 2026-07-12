// src/lib/components/dyn/use-bound-files.svelte.ts
import type {
    ChangePayload,
    IValueService,
    Unsubscribe,
    ValueSnapshot,
} from "$lib/store/ui/activity/type";
import { onDestroy } from "svelte";

export function useBoundFiles(
    service: IValueService,
    dirFn: () => string | undefined,
) {
    const state = $state<{ snapshot: ValueSnapshot<string[]> }>({
        snapshot: { value: undefined, loading: true, error: null },
    });
    let unsub: Unsubscribe | null = null;
    let bound: string | undefined;

    function teardown() {
        unsub?.();
        unsub = null;
    }
    function bind(dir: string | undefined) {
        teardown();
        bound = dir;
        if (!dir) {
            state.snapshot = { value: undefined, loading: false, error: null };
            return;
        }
        unsub = service.onFileChange(dir, (p: ChangePayload<string[]>) => {
            const prev = state.snapshot;
            state.snapshot = {
                value: "value" in p ? p.value : prev.value,
                loading: p.loading ?? false,
                error: p.error ?? null,
            };
        });
    }
    $effect(() => {
        const d = dirFn();
        if (d !== bound) bind(d);
    });
    onDestroy(teardown);
    return state;
}