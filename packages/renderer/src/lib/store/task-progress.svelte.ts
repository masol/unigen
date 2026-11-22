import evtbus from "$lib/utils/evtbus";
import type {
    TaskSnapshot,
    TaskWarning,
} from "@app/main/types";

/**
 * 通用任务进度 store。
 *
 * 使用方式（Svelte 5）：
 *   - 组件读某一任务：`const startup = $derived(taskProgressStore.get("startup"))`
 *   - 状态栏读聚合：`const digest = $derived(taskProgressStore.digest)`
 *   - 事件订阅只在 `taskProgressStore.init()` 内做一次：
 *       `taskProgressStore.init()`
 *
 * 关于"是否需要给每个 id 返回 store"：
 *   不需要。Svelte 5 的 `$state` 本身就是细粒度响应式的（在 .svelte.ts 中
 *   对 `Record` 赋值是 key 级触发）。`get(id)` 读取 `#tasks[id]` 会把依赖
 *   绑定到该 key 上；放进 `$derived` / `$effect` 就会自动重新求值。
 *   若额外返回一个"每 id 的 store 对象"，除了多一层封装与生命周期管理，
 *   无法带来任何响应性增益，反而在跨组件共享时不必要地增加心智负担。
 */
class TaskProgressStore {
    #tasks = $state<Record<string, TaskSnapshot>>({});
    #inited = false;

    #onTaskUpdate = (snapshot: TaskSnapshot): void => {
        this.apply(snapshot);
    };

    get all(): TaskSnapshot[] {
        return Object.values(this.#tasks);
    }

    get(id: string): TaskSnapshot | undefined {
        return this.#tasks[id];
    }

    /**
     * 负责监听 evtbus 中的 task:update 事件（由主进程发送），并更新 #tasks。
     *
     * 这里集中完成事件接线，避免 App.svelte 等业务组件散落订阅逻辑。
     * 多次调用是幂等的，便于 App 初始化 / HMR / 测试场景安全重复调用。
     */
    init(): void {
        if (this.#inited) return;
        this.#inited = true;
        evtbus.on("task:update", this.#onTaskUpdate);
    }

    /**
     * 汇总告警信息，用于 status bar 之类的全局组件。
     * 只统计 warn / error；info 级可能由业务自行取用。
     */
    get digest(): { total: number; errorCount: number; warnCount: number } {
        let total = 0;
        let errorCount = 0;
        let warnCount = 0;
        for (const snap of Object.values(this.#tasks)) {
            for (const w of snap.warnings) {
                total++;
                if (w.level === "error") errorCount++;
                else if (w.level === "warn") warnCount++;
            }
        }
        return { total, errorCount, warnCount };
    }

    /** 应用来自主进程的最新快照（多余字段会被忽略） */
    apply(snapshot: TaskSnapshot): void {
        this.#tasks[snapshot.id] = snapshot;
    }

    remove(id: string): void {
        if (!(id in this.#tasks)) return;
        const next = { ...this.#tasks };
        delete next[id];
        this.#tasks = next;
    }

    clearFinished(): void {
        const next: Record<string, TaskSnapshot> = {};
        let changed = false;
        for (const [id, snap] of Object.entries(this.#tasks)) {
            if (snap.status === "completed" || snap.status === "cancelled") {
                changed = true;
                continue;
            }
            next[id] = snap;
        }
        if (changed) this.#tasks = next;
    }

    /** 某任务的全部告警（无任务时返回空数组，便于模板分支渲染） */
    warningsOf(id: string): ReadonlyArray<TaskWarning> {
        return this.#tasks[id]?.warnings ?? [];
    }
}

const KEY = Symbol.for("unigen.renderer.taskProgress");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const taskProgressStore: TaskProgressStore = ((globalThis as any)[KEY] ??=
    new TaskProgressStore());

export type { TaskSnapshot, TaskWarning };
