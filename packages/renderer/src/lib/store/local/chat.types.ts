// 聊天领域类型 —— 渲染侧视图
//
// 本文件只做两件事:
//   1. 从主进程共享类型 ($app/shared/chat) 做仅类型再出口
//   2. 定义 UI 专属的 ChatMessage —— 持久化字段 + MarkdownMessage 结构 + 瞬态 streaming 标记
//
// 禁止从 $app/shared/* 引入任何运行时符号 (单向依赖、types-only)

import type { MarkdownMessage } from "$lib/components/markdown/type";
import type { ChatMessage as PersistedChatMessage } from "@app/main/types";

export type {
    AgentIdentity, ChatSession, ChatStreamEvent, ListMessagesParams, ListSessionsParams, MessageStreamEvent, NewChatMessage, NewChatSession, SessionPatch, TraceAgentNode, TraceInputNode, TraceNode, TraceNodeKind, TraceOutputNode, TraceReasoningNode, TraceSourceNode, TraceStatus, TraceStepNode, TraceStreamEvent, TraceToolNode
} from "@app/main/types";

/**
 * UI 层 ChatMessage。
 *
 * - 持久化字段来自 PersistedChatMessage，但 sessionId 在渲染端可选
 * - 结构性兼容 MarkdownMessage，可直接喂给 markdown 渲染组件。
 * - `streaming` 为纯 UI 态，不持久化。
 */
export type ChatMessage = MarkdownMessage &
    PersistedChatMessage & {
        streaming?: boolean;
    };