// packages/renderer/src/lib/store/local/msg/stream.ts
//
// 把 ChatStreamEvent 应用到 ChatMessage[] 的纯函数。
// 采用「就地修改」而非「替换引用」：
//   - this.messages（$state 数组）与 RunState.messages 共享同一引用时，
//     就地修改即可双写，无需额外同步；
//   - 后台 run 的事件也走同一路径，保持引用稳定，切回时数据完整。
//
// 依赖 store 的副作用统一通过 StreamSideEffects 注入，具体实现见 msg.svelte.ts。
import Logger from "electron-log/renderer.js";
import { isTraceAgentNode } from "../chat.guards";
import {
    findMessageIn,
    findTraceNodeIn,
    forceEndTraces,
} from "./helpers";
import type {
    ChatMessage,
    ChatStreamEvent,
    RunState,
    StreamSideEffects,
} from "./types";

export function applyStreamEvent(
    messages: ChatMessage[],
    event: ChatStreamEvent,
    state: RunState | undefined,
    side: StreamSideEffects,
): void {
    switch (event.type) {
        case "message.start": {
            const msg: ChatMessage = {
                id: event.messageId,
                sessionId: event.sessionId,
                role: "assistant",
                content: "",
                timestamp: event.timestamp,
                streaming: true,
                agent: event.agent,
                traces: [],
            };
            // 使用 push 保持数组引用稳定；活跃态由 $state 深度代理触发响应式
            messages.push(msg);
            // 显式传 sessionId，避免后台事件累加到当前 active session 计数上
            side.bumpMessageCount(1, event.sessionId);
            if (state) {
                state.activeAssistantId = event.messageId;
                state.lastAssistantId = event.messageId;
            }
            break;
        }
        case "message.delta": {
            const m = findMessageIn(messages, event.messageId);
            if (m) {
                // 防御：content 若因极端场景为 undefined / 非字符串，
                // 直接 += 会产成 "undefined..." 污染，需先归一到字符串。
                m.content =
                    (typeof m.content === "string" ? m.content : "") +
                    event.delta;
            }
            break;
        }
        case "message.end": {
            if (state && state.activeAssistantId === event.messageId) {
                state.activeAssistantId = null;
            }
            const m = findMessageIn(messages, event.messageId);
            if (!m) break;
            m.streaming = false;
            if (event.content != null) {
                m.content = event.content;
            }
            forceEndTraces(m);
            break;
        }
        case "message.error": {
            if (state && state.activeAssistantId === event.messageId) {
                state.activeAssistantId = null;
            }
            const m = findMessageIn(messages, event.messageId);
            if (!m) break;
            m.streaming = false;
            m.isError = true;
            m.content = event.error;
            forceEndTraces(m);
            break;
        }
        case "trace.start": {
            const m = findMessageIn(messages, event.messageId);
            if (!m) break;
            if (!Array.isArray(m.traces)) {
                m.traces = [];
            }

            if (event.parentId) {
                const parent = findTraceNodeIn(
                    messages,
                    event.messageId,
                    event.parentId,
                );
                if (parent && isTraceAgentNode(parent)) {
                    if (!Array.isArray(parent.children)) {
                        parent.children = [];
                    }
                    parent.children.push(event.node);
                } else {
                    Logger.warn(
                        "trace.start: parentId not found or not an agent node, mounting to root",
                        { parentId: event.parentId, nodeId: event.node.id },
                    );
                    m.traces.push(event.node);
                }
            } else {
                m.traces.push(event.node);
            }
            break;
        }
        case "trace.update": {
            const node = findTraceNodeIn(
                messages,
                event.messageId,
                event.nodeId,
            );
            if (node) {
                Object.assign(node, event.patch);
            }
            break;
        }
        case "trace.detail.delta": {
            const node = findTraceNodeIn(
                messages,
                event.messageId,
                event.nodeId,
            );
            if (!node) {
                Logger.warn("trace.detail.delta: node not found", {
                    nodeId: event.nodeId,
                });
                break;
            }

            node.detail = (node.detail ?? "") + event.delta;
            node.streaming = true;
            break;
        }
        case "trace.end": {
            const node = findTraceNodeIn(
                messages,
                event.messageId,
                event.nodeId,
            );
            if (!node) break;

            // 应用 trace.end 携带的完整 patch：
            // 协议中 description（含耗时/错误信息）、status、finishedAt 等
            // 都可能随 end 一起下发，不能只挑 status/finishedAt，
            // 否则实时视图会缺失 description（数据库加载时才可见）。
            if (event.patch) {
                Object.assign(node, event.patch);
            }
            if (event.detail != null) node.detail = event.detail;

            // trace 已结束，最后统一置为终止态
            node.streaming = false;

            // 兜底终止逻辑：如果后端未设置终态，此处补齐
            if (node.status === "running" || node.status === "pending") {
                node.status = "success";
                if (!node.finishedAt) {
                    node.finishedAt = Date.now();
                }
            }
            break;
        }
    }
}