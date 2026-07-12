// src/lib/components/dyn/binding.ts
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 绑定机制（Binding）——动态面板节点与数据层之间的唯一契约。          ║
 * ║                                                                    ║
 * ║ 【为什么独立成模块】                                               ║
 * ║  binding 描述「一个节点读/写数据层的哪个 key、是否只读、是否需要   ║
 * ║  跟踪 main 进程的静默变更」。它与具体节点类型无关，是横切能力，    ║
 * ║  因此从 ast.ts 拆出，集中演进（未来加 schema 校验、transform 等）。║
 * ║                                                                    ║
 * ║ 【节点作者须知 —— 只需记住三步】                                   ║
 * ║  1. 在 AST 节点接口里放一个 `binding: Binding` 字段。              ║
 * ║  2. 组件 <script> 顶层调用 `const b = useBinding(service,          ║
 * ║     () => node.binding)`（**必须在顶层、非条件分支**，因为它内部   ║
 * ║     用 $effect / onDestroy 管理订阅生命周期）。                    ║
 * ║  3. 读值：`b.value` / `b.loading` / `b.error` / `b.readonly`；     ║
 * ║     写值：`await b.set(next)`（readonly 时自动拒绝）。             ║
 * ║  → 首帧异步加载、main 静默变更实时刷新、组件卸载自动注销，全部由   ║
 * ║    useBinding 内部完成，节点无需关心。                             ║
 * ║                                                                    ║
 * ║ 【track 语义】                                                     ║
 * ║  track !== false（默认 true）时订阅 main 变更；某些纯本地、不会被  ║
 * ║  main 静默改写的字段可显式 track:false 省去订阅开销。              ║
 * ║                                                                    ║
 * ║ 【扩展点（未来）】                                                 ║
 * ║  - schema：对写入值做校验/规约，非法则拒绝并给 error。             ║
 * ║  - transform：读/写时做序列化转换（如 JSON <-> 富对象）。          ║
 * ║  这些都应在此模块内实现，节点侧调用方式保持不变。                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */// src/lib/components/dyn/binding.svelte.ts
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ 绑定机制（Binding）——动态面板节点与数据层之间的唯一契约。          ║
 * ║  （文件头文档见原注释，未改）                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import type {
    ChangePayload,
    IValueService,
    Unsubscribe,
    ValueSnapshot,
} from "$lib/store/ui/activity/type";
import { onDestroy } from "svelte";

/** 值绑定：声明节点读/写数据层的哪个 key，及其行为。 */
import type { Binding } from '@app/main/types';

/** 写 key：writeKey 优先，否则 readKey */
export function writeKeyOf(b: Binding): string {
    return b.writeKey ?? b.readKey;
}

export interface BoundHandle<T = unknown> {
    readonly value: T | undefined;
    readonly loading: boolean;
    readonly error: string | null;
    readonly readonly: boolean;
    set(next: unknown): Promise<boolean>;
}

export function useBinding<T = unknown>(
    service: IValueService,
    bindingFn: () => Binding,
): BoundHandle<T> {
    const st = $state<{ snap: ValueSnapshot<T> }>({
        snap: { value: undefined, loading: true, error: null },
    });

    let unsub: Unsubscribe | null = null;
    let boundKey: string | undefined;

    function teardown() {
        unsub?.();
        unsub = null;
    }

    function bind(b: Binding) {
        teardown();
        boundKey = b.readKey;

        // 【修正】空 readKey 短路：不 fetch、不订阅，避免对空 key 发起请求
        if (!b.readKey) {
            st.snap = { value: undefined, loading: false, error: null };
            return;
        }

        const track = b.track !== false;

        if (!track) {
            // 不订阅：首帧拉一次即可
            st.snap = { value: undefined, loading: true, error: null };
            void service
                .fetch<T>(b.readKey)
                .then((v) => (st.snap = { value: v, loading: false, error: null }))
                .catch(
                    (e) =>
                    (st.snap = {
                        value: undefined,
                        loading: false,
                        error: e instanceof Error ? e.message : String(e),
                    }),
                );
            return;
        }

        // 订阅：service 首帧推 loading→value，main 变更后续推
        st.snap = service.getState<T>(b.readKey);
        unsub = service.onChange<T>(b.readKey, (p: ChangePayload<T>) => {
            const prev = st.snap;
            st.snap = {
                value: "value" in p ? p.value : prev.value,
                loading: p.loading ?? false,
                error: p.error ?? null,
            };
        });
    }

    // binding.readKey 变化时重订阅
    $effect(() => {
        const b = bindingFn();
        if (b.readKey !== boundKey) bind(b);
    });

    onDestroy(teardown);

    return {
        get value() {
            return st.snap.value;
        },
        get loading() {
            return st.snap.loading;
        },
        get error() {
            return st.snap.error;
        },
        get readonly() {
            return bindingFn().readonly ?? false;
        },
        async set(next: unknown) {
            const b = bindingFn();
            if (b.readonly) return false;
            await service.set(writeKeyOf(b), next);
            return true;
        },
    };
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