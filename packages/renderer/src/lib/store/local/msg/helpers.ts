// packages/renderer/src/lib/store/local/msg/helpers.ts
//
// 无状态工具：只对传入的 ChatMessage[] / TraceNode 做纯操作，
// 不持有任何 store 状态，便于单元测试和复用。
import { hasTraceChildren } from "../chat.guards";
import type { ChatMessage, SeqDeferred, TraceNode } from "./types";

export function createDeferred(): SeqDeferred {
    let resolve!: (suc: boolean) => void;
    const promise = new Promise<boolean>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

export function newId(): string {
    return crypto?.randomUUID?.() ?? Date.now().toString();
}

export function findMessageIn(
    messages: ChatMessage[],
    id: string,
): ChatMessage | undefined {
    return messages.find((m) => m.id === id);
}

/**
 * 在指定 messages 数组的 trace 树中递归查找指定 id 的节点。
 * 显式传入 messages：活跃流与后台流走同一套遍历逻辑，避免分叉。
 */
export function findTraceNodeIn(
    messages: ChatMessage[],
    messageId: string,
    nodeId: string,
): TraceNode | null {
    const msg = findMessageIn(messages, messageId);
    if (!msg || !Array.isArray(msg.traces)) return null;

    const search = (nodes: TraceNode[]): TraceNode | null => {
        if (!Array.isArray(nodes)) return null;
        for (const node of nodes) {
            if (!node) continue;
            if (node.id === nodeId) return node;
            if (hasTraceChildren(node) && Array.isArray(node.children)) {
                const found = search(node.children);
                if (found) return found;
            }
        }
        return null;
    };

    return search(msg.traces);
}

export function forceEndTraces(message: ChatMessage): void {
    if (!Array.isArray(message.traces) || message.traces.length === 0) return;

    const endNode = (node: TraceNode) => {
        if (!node) return;
        if (node.status === "running" || node.status === "pending") {
            node.status = "success";
            node.streaming = false;
            if (!node.finishedAt) {
                node.finishedAt = Date.now();
            }
        }
        if (hasTraceChildren(node) && Array.isArray(node.children)) {
            node.children.forEach(endNode);
        }
    };

    message.traces.forEach(endNode);
}

/**
 * 恢复运行中消息的 trace 视觉：
 * DB 落盘时 trace.status 通常保留为 running/pending，但 streaming 字段
 * 未必同步写入（服务端可能在 trace.end 才落盘 streaming）。若不补回，
 * 切回会话后 TraceNode 的 `isRunning = status==="running" && streaming`
 * 恒为 false，spinner 全部消失，而 input 仍因 isLoading/running 被禁用。
 *
 * 仅对 running/pending 节点补 streaming=true；已终态节点保持原样，
 * 避免把历史已完成节点误标为运行中。
 */
export function reviveRunningTraces(message: ChatMessage): void {
    if (!Array.isArray(message.traces) || message.traces.length === 0) return;

    const revive = (node: TraceNode) => {
        if (!node) return;
        if (node.status === "running" || node.status === "pending") {
            node.streaming = true;
        }
        if (hasTraceChildren(node) && Array.isArray(node.children)) {
            node.children.forEach(revive);
        }
    };

    message.traces.forEach(revive);
}

/**
 * 在消息序列中定位「配对边界」：
 * - 用户消息：配对从自身开始，到下一个用户消息前的最后一条助手消息结束；
 * - 助手消息：向前回溯到最近的用户消息作为配对起点，向后延伸到下一个用户消息前的最后一条助手消息。
 */
export function findPairBoundary(
    messages: ChatMessage[],
    idx: number,
): { start: number; end: number } {
    const target = messages[idx];
    let start = idx;
    let end = idx;

    if (target.role === "user") {
        for (let i = idx + 1; i < messages.length; i++) {
            if (messages[i].role === "user") break;
            end = i;
        }
    } else {
        for (let i = idx - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
                start = i;
                break;
            }
        }
        for (let i = idx + 1; i < messages.length; i++) {
            if (messages[i].role === "user") break;
            end = i;
        }
    }

    return { start, end };
}