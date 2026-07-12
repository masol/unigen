// $lib/store/dashboard.svelte.ts
// 私有 store：所有状态、衍生值、副作用、对外回调都集中在这里。
// 子组件通过只读 getter 消费，通过调用方法修改，完全不持有本地状态。
import { projectStore } from "$lib/store/project.svelte";
import { confirmStore } from "$lib/store/ui/confirm.svelte";
import { api, safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import type { RunState } from "@app/main/types";
import log from "electron-log/renderer";
import { toast } from "svelte-sonner";

// ─── 类型 ───────────────────────────────────────────────────────
interface LogEntry {
    id: string;
    time: number; // 时间戳（毫秒）
    message: string;
}

// ─── Store ──────────────────────────────────────────────────────
class DashboardStore {
    // ── 私有状态（精确选型）──────────────────────────────────────
    #elapsedSeconds = $state(0);
    #terminatingSeconds = $state(0);
    #logs = $state.raw<LogEntry[]>([]);
    #target = $state<string>("post");
    #preserveLogs = $state(false); // 是否保留日志（跨任务重启）
    forceShowLog = $state(false);

    // ── 私有非响应式资源 ─────────────────────────────────────────
    #clockTimer: ReturnType<typeof setInterval> | null = null;
    #terminateTimer: ReturnType<typeof setInterval> | null = null;


    // ── 派生 ─────────────────────────────────────────────────────
    readonly showLog = $derived(this.runState !== 'idle' || this.forceShowLog)
    readonly #statusLabel = $derived(
        projectStore.runState === "idle"
            ? "空闲"
            : projectStore.runState === "running"
                ? "运行中"
                : "正在终止",
    );

    private getHintText(state: RunState): string {
        switch (state) {
            case 'idle':
                return projectStore.activity?.hints.idle ?? "点击下方按钮，让AI开始工作。";
            case 'running':
                return projectStore.activity?.hints.running ?? "每一步结果都会自动保存，再次运行不会重复计算。可随时点击「终止」，已完成的部分不会丢失。";
            default:
                return projectStore.activity?.hints.term ?? "正在等待当前这一步完成后安全停止。若此刻强制关机，当前正在进行的这一步将作废，需要重新计算。"
        }
    }

    readonly #hintText = $derived(
        this.getHintText(projectStore.runState)
    );

    readonly #buttonLabel = $derived(
        projectStore.runState === "idle"
            ? "开始运行"
            : projectStore.runState === "running"
                ? "终止任务"
                : "强制停止",
    );

    constructor() {
        log.info("[DashboardStore] initialized");

        // 监听任务进度报告
        evtbus.on("task_progess_report", (message: string) => {
            this.#pushLog(message);
        });

        // 监听任务完成事件
        evtbus.on("task_finished", (evt: { success: boolean; reason?: string }) => {
            log.info(`[DashboardStore] task_finished: success=${evt.success}, reason=${evt.reason ?? ""}`);

            // 清理所有计时器
            this.#clearTimers();

            // 重置计时状态
            this.#elapsedSeconds = 0;
            this.#terminatingSeconds = 0;

            // 添加完成日志
            if (evt.success) {
                const msg = "✓ 任务已成功完成 · 所有步骤已保存"
                this.#pushLog(msg);
                toast.success(msg);
            } else {
                const reasonText = evt.reason ? ` · ${evt.reason}` : "";
                const msg = `✗ 任务已终止${reasonText}`;
                this.#pushLog(msg);
                toast.error(msg);
            }
        });
    }

    // ── 只读门面 ─────────────────────────────────────────────────
    get target(): string {
        return this.#target;
    }
    get runState() {
        return projectStore.runState;
    }
    get elapsedSeconds() {
        return this.#elapsedSeconds;
    }
    get terminatingSeconds() {
        return this.#terminatingSeconds;
    }
    get logs() {
        return this.#logs;
    }
    get infoBlocks() {
        return projectStore.activity?.infocards ?? [];
    }
    get statusLabel() {
        return this.#statusLabel;
    }
    get hintText() {
        return this.#hintText;
    }
    get buttonLabel() {
        return this.#buttonLabel;
    }
    get preserveLogs() {
        return this.#preserveLogs;
    }

    async setTarget(newTarget: string): Promise<void> {
        await safeApi().project.set({
            key: "target",
            value: newTarget
        });
        this.#target = newTarget;
    }

    // ── 工具 ─────────────────────────────────────────────────────
    #pushLog(message: string) {
        // 新日志插入在数组头部（最新在上）
        this.#logs = [
            {
                id: crypto.randomUUID(),
                time: Date.now(),
                message,
            },
            ...this.#logs,
        ];
    }

    #clearTimers = () => {
        if (this.#clockTimer) {
            clearInterval(this.#clockTimer);
            this.#clockTimer = null;
        }
        if (this.#terminateTimer) {
            clearInterval(this.#terminateTimer);
            this.#terminateTimer = null;
        }
        log.debug("[DashboardStore] all timers cleared");
    };

    // ── 状态机 ───────────────────────────────────────────────────
    async #startRunning() {
        this.forceShowLog = false;
        log.debug("[DashboardStore] startRunning() called");
        await projectStore.start();

        const startime = await api().project.startTime();
        const nowTime = new Date().getTime();

        this.#elapsedSeconds = startime > 0 ? Math.floor((nowTime - startime) / 1000) : 0;

        // 如果未勾选"保留日志"，则清空历史日志
        if (!this.#preserveLogs) {
            this.#logs = [];
        }
        // this.#pushLog("任务已启动 · 节点连接正常");
        log.info("[DashboardStore] run started");

        if (this.runState === 'idle') {
            // 任务已经结束了。
            return;
        }

        this.#clockTimer = setInterval(() => {
            this.#elapsedSeconds += 1;
        }, 1000);
    }

    #enterTerminating() {
        log.debug("[DashboardStore] enterTerminating() called");
        this.#terminatingSeconds = 0;
        this.#pushLog("收到终止信号 · 等待当前节点安全收尾 …");
        log.info("[DashboardStore] terminating requested");
        projectStore.stop(false);

        this.#terminateTimer = setInterval(() => {
            this.#terminatingSeconds += 1;
        }, 1000);
    }

    #finalizeStop(message: string) {
        projectStore.stop(true);
        this.#clearTimers();
        this.#pushLog(message);
        this.#elapsedSeconds = 0;
        this.#terminatingSeconds = 0;
        log.info(`[DashboardStore] run stopped: ${message}`);
    }

    // ── 对外方法（子组件调用，箭头字段确保 this 绑定）──────────────
    handleMainButton = async (): Promise<void> => {
        log.debug(
            `[DashboardStore] handleMainButton() called, runState=${projectStore.runState}`,
        );

        if (projectStore.runState === "idle") {
            await this.#startRunning();
            return;
        }

        if (projectStore.runState === "running") {
            this.#enterTerminating();
            return;
        }

        if (projectStore.runState === "terminating") {
            await this.forceStop();
        }
    };

    private async forceStop() {
        const ok = await confirmStore.request({
            title: "强制立即停止？",
            message:
                "当前正在进行的步骤将不会被保存，下次运行需要重新计算这一步。",
        });
        if (!ok) return;
        this.#finalizeStop("已被强制停止 · 最后一步未保存");
    }

    async start(): Promise<boolean> {
        if (projectStore.runState === "idle") {
            await this.#startRunning();
            return true;
        }
        return false;
    }

    async stop(bForce = false): Promise<boolean> {
        if (projectStore.runState === "idle") {
            return false;
        }
        if (bForce) {
            await this.forceStop();
            return true;
        }
        if (projectStore.runState === "running") {
            this.#enterTerminating();
            return true;
        }
        return false;
    }

    clearLogs = (): void => {
        log.debug("[DashboardStore] clearLogs() called");
        this.#logs = [];
    };

    togglePreserveLogs = (): void => {
        log.debug(`[DashboardStore] togglePreserveLogs() called, current=${this.#preserveLogs}`);
        this.#preserveLogs = !this.#preserveLogs;
    };

    destroy = (): void => {
        log.debug("[DashboardStore] destroy() called");
        this.#clearTimers();
    };
}

export const dashboardStore = new DashboardStore();