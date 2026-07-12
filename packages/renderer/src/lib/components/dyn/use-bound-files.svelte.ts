// src/lib/components/dyn/use-bound-files.svelte.ts
import type { IValueService, Unsubscribe } from "$lib/store/ui/activity/type";
import { onDestroy } from "svelte";

export interface BoundFiles {
    readonly value: string[] | undefined;
    readonly loading: boolean;
    readonly error: string | null;
}

export function useBoundFiles(
    service: IValueService,
    dirFn: () => string | undefined,
): BoundFiles {
    const st = $state<{
        value: string[] | undefined;
        loading: boolean;
        error: string | null;
    }>({ value: undefined, loading: true, error: null });

    let unsub: Unsubscribe | null = null;
    let bound: string | undefined;
    let gen = 0;

    function teardown() {
        unsub?.();
        unsub = null;
    }

    function bind(dir: string | undefined) {
        teardown();
        bound = dir;
        const myGen = ++gen;

        if (!dir) {
            st.value = undefined;
            st.loading = false;
            st.error = null;
            return;
        }

        st.value = undefined;
        st.loading = true;
        st.error = null;

        let gotLive = false;
        unsub = service.subscribeFiles(dir, (value) => {
            if (myGen !== gen) return;
            gotLive = true;
            st.value = value;
            st.loading = false;
            st.error = null;
        });

        void service
            .fileList(dir)
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

    $effect(() => {
        const d = dirFn();
        if (d !== bound) bind(d);
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
    };
}