/**
 * 通用长时任务进度快照。
 *
 * 设计目标：
 * - 一个"任务"由一个稳定 id 标识（如 "startup" / "download:model-q4" / "install:skill-xxx"）
 * - 每个任务自带 phase / message / progress / warnings
 * - 通过单一事件 `task:update` 广播，renderer 侧的 TaskProgressStore 按 id 路由
 *
 * 与旧 `startup:progress` / `startup:warning` 事件的关系：
 * - 旧机制是此模型在 id = "startup" 下的特例。
 */
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskWarning {
    /** 稳定 id，用于去重（如 "startup.embedding.degraded"） */
    id: string;
    level: "info" | "warn" | "error";
    /** 稳定 code，用于 i18n 或后续处理 */
    code: string;
    message: string;
    detail?: string;
    timestamp: number;
}

export interface TaskSnapshot {
    /** 任务唯一 id */
    id: string;
    /** 人类可读的标题（如 "启动" / "下载模型"） */
    title: string;
    /** 当前阶段标识，自由字符串，UI 仅展示 / 用于选图标 */
    phase: string;
    /** 当前阶段通知文字 */
    message: string;
    /** 0 ~ 100，仅作视觉参考，不承诺线性 */
    progress: number;
    status: TaskStatus;
    warnings: TaskWarning[];
    startedAt: number;
    updatedAt: number;
    /** 仅 status 为 completed / failed / cancelled 时有值 */
    finishedAt?: number;
}