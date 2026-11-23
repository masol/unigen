// packages/renderer/src/lib/store/local/msg/recovery.ts
//
// reload 时的消息修复策略：
//   - 未运行会话：全部收尾（streaming=false，trace 强制成功）；
//   - 运行中会话：活跃助手消息保留流状态，其它消息回退为已收尾。
import Logger from "electron-log/renderer.js";
import { forceEndTraces, reviveRunningTraces } from "./helpers";
import type { ChatMessage, RunState } from "./types";

/**
 * 未运行会话的恢复：执行自动修复。
 *
 * 消息一旦不处于运行态，任何 streaming=true 或 status=running/pending 的
 * trace 都是异常落盘（进程中断、旧版本残留等），必须收尾，否则 UI 会永久转圈。
 *
 * 每条消息独立 try/catch：单条异常不应中断整批修复。
 */
export function repairIdleMessages(messages: ChatMessage[]): ChatMessage[] {
    if (!Array.isArray(messages)) return [];
    for (const m of messages) {
        if (!m || typeof m !== "object") continue;
        try {
            m.streaming = false;
            forceEndTraces(m);
        } catch (err) {
            Logger.error(
                "[MessageStore] repairIdleMessages failed for message",
                { messageId: (m as ChatMessage).id, err },
            );
        }
    }
    return messages;
}

/**
 * 运行中会话的恢复：保留活跃流状态，清理无关僵尸态。
 *
 * - 以 DB 结果为基础，用内存快照覆盖同 id 消息（内存是活跃流，内容更权威）；
 * - activeAssistantId 指向的助手消息：强制 streaming=true，
 *   并调用 #reviveRunningTraces 恢复 trace 节点的 streaming 视觉标志
 *   （DB 落盘时 trace.status 通常保留为 running/pending，但 streaming
 *   字段未必同步落盘；不恢复则切回会话后 spinner 消失，而 input 仍被禁用）；
 * - 其它消息：在运行中会话里不应保持运行态（可能来自上一个已结束 run 的
 *   异常落盘），执行与静止态相同的修复。
 *
 * 防御：running 标记存在但 runState 缺失（理论不可达）时，无法定位活跃流，
 * 退化为全量修复，避免永久转圈。
 */
export function restoreRunningMessages(
    loaded: ChatMessage[],
    runState: RunState | undefined,
    liveSnapshot: ChatMessage[],
): ChatMessage[] {
    const safeLoaded = Array.isArray(loaded) ? loaded : [];
    const safeSnapshot = Array.isArray(liveSnapshot) ? liveSnapshot : [];
     
    const byId = new Map(safeLoaded.map((m) => [m.id, m]));
    for (const live of safeSnapshot) {
        if (live && typeof live === "object" && live.id) {
            byId.set(live.id, live);
        }
    }
    const merged = Array.from(byId.values()).sort(
        (a, b) => a.timestamp - b.timestamp,
    );

    if (!runState) {
        Logger.warn(
            "[MessageStore] reload(): running 标记存在但 runState 缺失，退化为静止态修复",
        );
        return repairIdleMessages(merged);
    }

    const activeId = runState.activeAssistantId;
    if (activeId && !merged.some((m) => m.id === activeId)) {
        Logger.warn(
            "[MessageStore] reload(): activeAssistantId 在 DB 中未找到，流内容可能在 reload 窗口丢失",
            { activeId },
        );
    }

    for (const m of merged) {
        if (!m || typeof m !== "object") continue;
        try {
            if (activeId && m.id === activeId && m.role === "assistant") {
                m.streaming = true;
                reviveRunningTraces(m);
                continue;
            }
            m.streaming = false;
            forceEndTraces(m);
        } catch (err) {
            Logger.error(
                "[MessageStore] restoreRunningMessages failed for message",
                { messageId: (m as ChatMessage).id, err },
            );
        }
    }
    return merged;
}