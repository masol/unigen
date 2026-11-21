import { STARTUP_TASK_ID } from "$libs/const.js";
import type {
    TaskSnapshot,
    TaskStatus,
    TaskWarning,
} from "$types/shared/task-progress.js";
import { broadcast } from "./rpcevt.js";

export type { TaskSnapshot, TaskStatus, TaskWarning };

/** 固定 id：应用启动过程。保留常量供调用方引用，避免魔法字符串。 */

const GLOBAL_KEY = Symbol.for("unigen.singleton.taskProgress");

class TaskProgressService {
    #tasks = new Map<string, TaskSnapshot>();

    /**
     * 注册 / 重置一个任务。若 id 已存在则覆盖（用于重跑场景）。
     */
    start(
        id: string,
        title: string,
        opts?: {
            initialPhase?: string;
            message?: string;
            progress?: number;
        },
    ): TaskSnapshot {
        const now = Date.now();
        const snap: TaskSnapshot = {
            id,
            title,
            phase: opts?.initialPhase ?? "starting",
            message: opts?.message ?? "准备中...",
            progress: clamp(opts?.progress ?? 0),
            status: "running",
            warnings: [],
            startedAt: now,
            updatedAt: now,
        };
        this.#tasks.set(id, snap);
        this.#publish(snap);
        return snap;
    }

    /**
     * 报告进度。若 id 尚未注册会自动创建（宽松容错），
     * 已处于 completed / failed / cancelled 的任务不再接受更新。
     */
    report(id: string, phase: string, message: string, progress: number): void {
        const snap = this.#tasks.get(id);
        if (!snap) {
            this.start(id, id, { initialPhase: phase, message, progress });
            return;
        }
        if (!isRunning(snap.status)) return;
        const next: TaskSnapshot = {
            ...snap,
            phase,
            message,
            progress: clamp(progress),
            updatedAt: Date.now(),
        };
        this.#tasks.set(id, next);
        this.#publish(next);
    }

    /**
     * 追加一条警告。按 warning.id 去重；同 id 多次调用不会重复广播。
     */
    warn(
        id: string,
        warning: Omit<TaskWarning, "timestamp"> & { timestamp?: number },
    ): void {
        let snap = this.#tasks.get(id);
        if (!snap) {
            snap = this.start(id, id);
        }
        if (snap.warnings.some((w) => w.id === warning.id)) return;
        const full: TaskWarning = {
            ...warning,
            timestamp: warning.timestamp ?? Date.now(),
        };
        const next: TaskSnapshot = {
            ...snap,
            warnings: [...snap.warnings, full],
            updatedAt: Date.now(),
        };
        this.#tasks.set(id, next);
        this.#publish(next);
    }

    /** 标记成功完成 */
    complete(id: string, message = "完成"): void {
        const snap = this.#tasks.get(id);
        if (!snap) return;
        const now = Date.now();
        const next: TaskSnapshot = {
            ...snap,
            status: "completed",
            phase: "completed",
            message,
            progress: 100,
            updatedAt: now,
            finishedAt: now,
        };
        this.#tasks.set(id, next);
        this.#publish(next);
    }

    /** 标记失败。会附带一条 error 级警告。 */
    fail(id: string, message: string, detail?: string): void {
        const snap = this.#tasks.get(id);
        if (!snap) {
            this.start(id, id, { initialPhase: "failed", message, progress: 0 });
            return this.fail(id, message, detail);
        }
        this.warn(id, {
            id: `${id}.failed`,
            level: "error",
            code: `${id}.failed`,
            message,
            detail,
        });
        const fresh = this.#tasks.get(id)!;
        const now = Date.now();
        const next: TaskSnapshot = {
            ...fresh,
            status: "failed",
            phase: "failed",
            message,
            updatedAt: now,
            finishedAt: now,
        };
        this.#tasks.set(id, next);
        this.#publish(next);
    }

    /** 标记取消 */
    cancel(id: string, message = "已取消"): void {
        const snap = this.#tasks.get(id);
        if (!snap) return;
        const now = Date.now();
        const next: TaskSnapshot = {
            ...snap,
            status: "cancelled",
            phase: "cancelled",
            message,
            updatedAt: now,
            finishedAt: now,
        };
        this.#tasks.set(id, next);
        this.#publish(next);
    }

    /**
     * 从活动列表中移除。不广播；renderer 侧若已存储该任务不会被通知删除，
     * 适合任务生命周期完全由 renderer 侧自己 guard 的场景（此处暂不广播，
     * 以免暴露一个仅在极少数场景下才用得上的事件分支）。
     */
    remove(id: string): void {
        this.#tasks.delete(id);
    }

    get(id: string): TaskSnapshot | undefined {
        return this.#tasks.get(id);
    }

    all(): TaskSnapshot[] {
        return Array.from(this.#tasks.values());
    }

    #publish(snap: TaskSnapshot): void {
        broadcast({
            name: "task:update",
            srcId: -1,
            payload: snap,
        });
    }
}

function clamp(n: number): number {
    return Math.max(0, Math.min(100, Math.round(n)));
}

function isRunning(status: TaskStatus): boolean {
    return status === "running" || status === "pending";
}

export function getTaskProgress(): TaskProgressService {
    const g = globalThis as unknown as Record<
        symbol,
        TaskProgressService | undefined
    >;
    return (g[GLOBAL_KEY] ??= new TaskProgressService());
}

/**
 * 启动任务（id = "startup"）的便捷适配器。
 *
 * 保留旧 API 的调用形态，便于业务代码在改造期间平滑迁移；
 * 内部实际写入通用任务进度服务。
 */
export interface StartupProgressAdapter {
    start(): void;
    report(phase: string, message: string, progress: number): void;
    warn(warning: Omit<TaskWarning, "timestamp"> & { timestamp?: number }): void;
    fail(message: string, detail?: string): void;
    complete(message?: string): void;
    get(): TaskSnapshot | undefined;
}

export function getStartupProgress(): StartupProgressAdapter {
    const svc = getTaskProgress();
    return {
        start: () =>
            svc.start(STARTUP_TASK_ID, "启动", {
                initialPhase: "starting",
                message: "正在启动...",
                progress: 0,
            }),
        report: (phase, message, progress) =>
            svc.report(STARTUP_TASK_ID, phase, message, progress),
        warn: (warning) => svc.warn(STARTUP_TASK_ID, warning),
        fail: (message, detail) => svc.fail(STARTUP_TASK_ID, message, detail),
        complete: (message) => svc.complete(STARTUP_TASK_ID, message),
        get: () => svc.get(STARTUP_TASK_ID),
    };
}