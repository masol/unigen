import { broadcast } from "./rpcevt.js";

/**
 * 启动过程阶段。
 * 新增阶段时同步更新 renderer 侧的 StartupPhase 联合类型。
 */
export type StartupPhase =
    | "starting"
    | "app-ready"
    | "search-db"
    | "search-sync"
    | "embedding"
    | "rerank"
    | "mcp"
    | "ready"
    | "failed";

export interface StartupWarning {
    /** 稳定 id，用于去重（例如 "search.embedding.degraded"） */
    id: string;
    level: "info" | "warn" | "error";
    code: string;
    message: string;
    detail?: string;
    timestamp: number;
}

export interface StartupProgressSnapshot {
    phase: StartupPhase;
    message: string;
    /** 0 ~ 100，仅作视觉参考，不承诺线性 */
    progress: number;
    warnings: StartupWarning[];
    timestamp: number;
}

const GLOBAL_KEY = Symbol.for("unigen.singleton.startupProgress");

class StartupProgressService {
    #state: StartupProgressSnapshot = {
        phase: "starting",
        message: "正在启动...",
        progress: 0,
        warnings: [],
        timestamp: Date.now(),
    };

    get snapshot(): StartupProgressSnapshot {
        return {
            ...this.#state,
            warnings: [...this.#state.warnings],
        };
    }

    /**
     * 报告进度。允许重复 phase，相当于细化。
     */
    report(phase: StartupPhase, message: string, progress: number): void {
        this.#state = {
            ...this.#state,
            phase,
            message,
            progress: Math.max(0, Math.min(100, progress)),
            timestamp: Date.now(),
        };
        this.#publishSnapshot();
    }

    /**
     * 追加一条警告。id 相同则不重复广播（去重）。
     * 警告会同时以独立事件发给 renderer，便于 status bar 这类常驻组件监听。
     */
    warn(
        warning: Omit<StartupWarning, "timestamp"> & { timestamp?: number },
    ): void {
        const full: StartupWarning = {
            ...warning,
            timestamp: warning.timestamp ?? Date.now(),
        };

        if (this.#state.warnings.some((w) => w.id === full.id)) {
            return;
        }

        this.#state = {
            ...this.#state,
            warnings: [...this.#state.warnings, full],
            timestamp: Date.now(),
        };

        broadcast({
            name: "startup:warning",
            srcId: -1,
            payload: full,
        });
        this.#publishSnapshot();
    }

    /**
     * 启动失败。会先把 phase 置为 failed 再抛错。
     * 注意：不在此处控制 appLife.bootstrapped 的 settle，由 initApp 负责。
     */
    fail(message: string, detail?: string): void {
        this.warn({
            id: "startup.failed",
            level: "error",
            code: "startup.failed",
            message,
            detail,
        });
        this.report("failed", message, this.#state.progress);
    }

    #publishSnapshot(): void {
        broadcast({
            name: "startup:progress",
            srcId: -1,
            payload: this.snapshot,
        });
    }
}

export function getStartupProgress(): StartupProgressService {
    const g = globalThis as unknown as Record<
        symbol,
        StartupProgressService | undefined
    >;
    return (g[GLOBAL_KEY] ??= new StartupProgressService());
}