// $lib/store/dashboard.svelte.ts
// 私有 store：所有状态、衍生值、副作用、对外回调都集中在这里。
// 子组件通过只读 getter 消费，通过调用方法修改，完全不持有本地状态。
import log from "electron-log/renderer";
import { confirmStore } from "$lib/store/ui/confirm.svelte";
import { IconBook2, IconSparkles, IconVideo } from "@tabler/icons-svelte";
import { api } from "$lib/utils/api";

// ─── 类型 ───────────────────────────────────────────────────────
export type RunState = "idle" | "running" | "terminating";
export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEntry {
    id: string;
    time: string;
    level: LogLevel;
    message: string;
}

export interface InfoBlock {
    key: "input" | "spec" | "output";
    title: string;
    subtitle: string;
    summary: string;
    icon: typeof IconBook2;
    metaLabel: string;
    metaTone: "ready" | "pending";
}

// ─── 静态数据（运行期不变，无需响应式包装）────────────────────
const infoBlocks: InfoBlock[] = [
    {
        key: "input",
        title: "输入",
        subtitle: "小说源文件",
        summary: "《长安十二时辰》· 24 章 · 18.6 万字",
        icon: IconBook2,
        metaLabel: "已就绪",
        metaTone: "ready",
    },
    {
        key: "spec",
        title: "说明要求",
        subtitle: "生成规格",
        summary: "电影风格 · 9:16 竖屏 · 单章约 3 分钟 · 中文配音",
        icon: IconSparkles,
        metaLabel: "已配置",
        metaTone: "ready",
    },
    {
        key: "output",
        title: "输出",
        subtitle: "导出目标",
        summary: "MP4 · 1080×1920 · H.264 · 本地 + 阿里云 OSS",
        icon: IconVideo,
        metaLabel: "待生成",
        metaTone: "pending",
    },
];

// ─── 假数据：模拟运行日志流（待替换为真实 api() 事件源）────────
const mockMessages: { level: LogLevel; msg: string }[] = [
    { level: "info", msg: "加载小说源文件 …" },
    { level: "success", msg: "文本解析完成 · 共识别 24 章 / 632 个场景" },
    { level: "info", msg: "场景 #001「靖安司初遇」语义分镜中 …" },
    { level: "success", msg: "场景 #001 分镜完成（缓存命中 0 / 8）" },
    { level: "info", msg: "调用 SDXL 生成关键帧 #001-01" },
    { level: "info", msg: "调用 SDXL 生成关键帧 #001-02" },
    { level: "success", msg: "关键帧 #001 全部生成完毕 · 用时 12.4s" },
    { level: "info", msg: "调用 CosyVoice 合成旁白 #001 …" },
    { level: "warn", msg: "场景 #002 命中缓存，跳过重复计算" },
    { level: "success", msg: "旁白 #001 合成完毕 · 时长 00:03:12" },
    { level: "info", msg: "运动模糊与镜头推拉渲染中 …" },
    { level: "success", msg: "章节 1/24 渲染完成 · 输出至 ./out/ch01.mp4" },
];
export type RunTarget = "segmentation" | "shot" | "entities" | "voice" | "storyboard" | "visual" | "video" | "post"


// ─── Store ──────────────────────────────────────────────────────
class DashboardStore {
    // ── 私有状态（精确选型）──────────────────────────────────────
    #runState = $state<RunState>("idle"); // 原始值 → $state
    #elapsedSeconds = $state(0); // 原始值 → $state
    #terminatingSeconds = $state(0); // 原始值 → $state
    #logs = $state.raw<LogEntry[]>([]); // 仅整体替换（spread 新数组）→ $state.raw
    #target = $state<RunTarget>("post"); // 运行目标。

    // ── 私有非响应式资源 ─────────────────────────────────────────
    #logTimer: ReturnType<typeof setInterval> | null = null;
    #clockTimer: ReturnType<typeof setInterval> | null = null;
    #terminateTimer: ReturnType<typeof setInterval> | null = null;
    #finalizeFallback: ReturnType<typeof setTimeout> | null = null;
    #msgIndex = 0;

    // 由 orchestrator 注入的业务回调，保持本文件无 Svelte 组件依赖
    #onOpenPanel: ((key: InfoBlock["key"]) => void) | null = null;

    // ── 派生 ─────────────────────────────────────────────────────
    readonly #statusLabel = $derived(
        this.#runState === "idle"
            ? "空闲"
            : this.#runState === "running"
                ? "运行中"
                : "正在终止",
    );

    readonly #hintText = $derived(
        this.#runState === "idle"
            ? "点击下方按钮，开始将小说转换为视频。"
            : this.#runState === "running"
                ? "每一步结果都会自动保存，再次运行不会重复计算。可随时点击「终止」，已完成的部分不会丢失。"
                : "正在等待当前这一步完成后安全停止。若此刻强制关机，当前正在进行的这一步将作废，需要重新计算。",
    );

    readonly #buttonLabel = $derived(
        this.#runState === "idle"
            ? "开始运行"
            : this.#runState === "running"
                ? "终止任务"
                : "强制停止",
    );

    constructor() {
        log.info("[DashboardStore] initialized");
    }

    // ── 只读门面 ─────────────────────────────────────────────────
    get target(): RunTarget {
        return this.#target;
    }
    get runState() {
        return this.#runState;
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
        return infoBlocks;
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

    async setTarget(newTarget: RunTarget): Promise<void> {
        await api().project.set({
            key: "target",
            value: newTarget
        });
        this.#target = newTarget;
    }

    // ── 工具 ─────────────────────────────────────────────────────
    #nowStr() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    }

    #pushLog(level: LogLevel, message: string) {
        // 整体替换，与 $state.raw 选型匹配
        this.#logs = [
            ...this.#logs,
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                time: this.#nowStr(),
                level,
                message,
            },
        ];
    }

    #clearTimers = () => {
        if (this.#logTimer) clearInterval(this.#logTimer);
        if (this.#clockTimer) clearInterval(this.#clockTimer);
        if (this.#terminateTimer) clearInterval(this.#terminateTimer);
        if (this.#finalizeFallback) clearTimeout(this.#finalizeFallback);
        this.#logTimer = this.#clockTimer = this.#terminateTimer = null;
        this.#finalizeFallback = null;
    };

    // ── 状态机 ───────────────────────────────────────────────────
    async #startRunning() {
        log.debug("[DashboardStore] startRunning() called");
        this.#runState = "running";
        this.#elapsedSeconds = 0;
        this.#logs = [];
        this.#msgIndex = 0;
        this.#pushLog("info", "任务已启动 · 节点连接正常");
        log.info("[DashboardStore] run started");

        this.#clockTimer = setInterval(() => {
            this.#elapsedSeconds += 1;
        }, 1000);

        this.#logTimer = setInterval(() => {
            const next = mockMessages[this.#msgIndex % mockMessages.length];
            this.#pushLog(next.level, next.msg);
            this.#msgIndex += 1;
        }, 1400);
    }

    #enterTerminating() {
        log.debug("[DashboardStore] enterTerminating() called");
        if (this.#logTimer) {
            clearInterval(this.#logTimer);
            this.#logTimer = null;
        }
        this.#runState = "terminating";
        this.#terminatingSeconds = 0;
        this.#pushLog("warn", "收到终止信号 · 等待当前节点安全收尾 …");
        log.info("[DashboardStore] terminating requested");

        this.#terminateTimer = setInterval(() => {
            this.#terminatingSeconds += 1;
        }, 1000);

        this.#finalizeFallback = setTimeout(() => {
            if (this.#runState === "terminating")
                this.#finalizeStop("节点收尾完成 · 任务已安全终止");
        }, 6000);
    }

    #finalizeStop(message: string) {
        this.#clearTimers();
        this.#pushLog("success", message);
        this.#runState = "idle";
        this.#elapsedSeconds = 0;
        this.#terminatingSeconds = 0;
        log.info(`[DashboardStore] run stopped: ${message}`);
    }

    // ── 对外方法（子组件调用，箭头字段确保 this 绑定）──────────────
    handleMainButton = async (): Promise<void> => {
        log.debug(
            `[DashboardStore] handleMainButton() called, runState=${this.#runState}`,
        );

        if (this.#runState === "idle") {
            await this.#startRunning();
            return;
        }

        if (this.#runState === "running") {
            // const ok = await confirmStore.request({
            //     title: "终止当前任务？",
            //     message:
            //         "已完成的步骤会保留，不需要重新计算。当前正在进行的这一步会被安全中止。",
            // });
            // if (!ok) return;
            this.#enterTerminating();
            return;
        }

        if (this.#runState === "terminating") {
            const ok = await confirmStore.request({
                title: "强制立即停止？",
                message:
                    "当前正在进行的步骤将不会被保存，下次运行需要重新计算这一步。",
            });
            if (!ok) return;
            this.#finalizeStop("已被强制停止 · 最后一步未保存");
        }
    };

    openPanel = (key: InfoBlock["key"]): void => {
        log.debug(`[DashboardStore] openPanel() called, key=${key}`);
        // 1. 优先回调给 orchestrator 注入的业务函数
        if (this.#onOpenPanel) {
            this.#onOpenPanel(key);
            return;
        }
        // 2. 尚未注入业务回调
        log.warn(`[DashboardStore] openPanel 未注入业务回调: ${key}`);
    };

    setOpenPanelHandler = (fn: (key: InfoBlock["key"]) => void): void => {
        log.debug("[DashboardStore] setOpenPanelHandler() called");
        this.#onOpenPanel = fn;
    };

    destroy = (): void => {
        log.debug("[DashboardStore] destroy() called");
        this.#clearTimers();
    };
}

export const dashboardStore = new DashboardStore();