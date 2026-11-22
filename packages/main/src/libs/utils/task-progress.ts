// packages/main/src/libs/utils/task-progress.ts
//
// 任务进度汇报子系统。
//
// 设计目标：
//   - 只暴露 4 个顶层函数：`publishTask` / `report` / `complete` / `fail`；
//   - **幂等**：每次调用都是一份自洽、完整、可重发的快照；
//   - **无状态**：不缓存任何任务、不维护 warnings 列表、不提供查询；
//   - **无业务 ID**：不认识 STARTUP_TASK_ID 之类的常量；id 由调用方定义；
//   - **客户端负责状态**：去重 / 累积 warnings / 记录 startedAt / 终态留存
//     全部在 renderer 完成；本模块只做"把快照扔过去"这一件事。
//
// 与客户端对齐的关键约定：
//   - `warnings` 是**增量**——每次调用只携带"本次新增"的警告；客户端
//     按 `warning.id` 去重累积。同一个 warning.id 重复广播是安全的（幂等）。
//   - `startedAt` / `updatedAt` 均填当前时间；真正的"任务开始时间"由
//     客户端首次收到某 id 时自行记录。
//   - `title` 缺省为 `id`；客户端如需人类可读标题，按 id 建立映射即可。
//
// 权威状态的查询走各子系统的专有接口（如 `codeRuntimeManager.getState`），
// `task:update` 事件只承担"变化通知"的角色。

import type {
    TaskSnapshot,
    TaskStatus,
    TaskWarning,
} from "$types/shared/task-progress.js";
import { getCurrentProject } from "./api/index.js";
import { broadcast } from "./rpcevt.js";

export type { TaskSnapshot, TaskStatus, TaskWarning };

/**
 * 唯一出口：把一份任务快照广播给客户端。
 *
 * 幂等且无状态；本地不做任何缓存。
 */
export function publishTask(snap: TaskSnapshot): void {
    broadcast({
        name: "task:update",
        srcId: getCurrentProject()?.wid ?? -1,
        payload: snap,
    });
}

function clamp(n: number): number {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

function snapshot(
    id: string,
    phase: string,
    message: string,
    progress: number,
    status: TaskStatus,
    warnings: TaskWarning[],
    finishedAt?: number,
): TaskSnapshot {
    const now = Date.now();
    const snap: TaskSnapshot = {
        id,
        title: id,
        phase,
        message,
        progress: clamp(progress),
        status,
        warnings,
        startedAt: now,
        updatedAt: now,
    };
    if (finishedAt !== undefined) snap.finishedAt = finishedAt;
    return snap;
}

/**
 * 上报任务处于执行中。
 *
 * @param id        任务标识（由调用方定义），客户端据此路由到子系统的查询接口
 * @param phase     当前阶段标识（自由字符串，仅用于 icon / i18n）
 * @param message   人类可读的通知
 * @param progress  0 ~ 100（仅作视觉参考，客户端可自行平滑）
 * @param warnings  本次新增的警告（**增量**；客户端按 id 去重累积）
 */
export function report(
    id: string,
    phase: string,
    message: string,
    progress: number,
    warnings: TaskWarning[] = [],
): void {
    publishTask(snapshot(id, phase, message, progress, "running", warnings));
}

/**
 * 上报任务已完成。
 */
export function complete(
    id: string,
    message = "完成",
    warnings: TaskWarning[] = [],
): void {
    publishTask(
        snapshot(
            id,
            "completed",
            message,
            100,
            "completed",
            warnings,
            Date.now(),
        ),
    );
}

/**
 * 上报任务已失败。
 *
 * 失败信息自动附带一条 error 级警告；客户端沿用"按 id 累积 warnings"的规则。
 */
export function fail(id: string, message: string, detail?: string): void {
    const now = Date.now();
    const warning: TaskWarning = {
        id: `${id}.failed`,
        level: "error",
        code: `${id}.failed`,
        message,
        detail,
        timestamp: now,
    };
    publishTask(
        snapshot(id, "failed", message, 0, "failed", [warning], now),
    );
}