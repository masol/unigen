// packages/main/types/shared/chat.ts
//
// 聊天领域的共享类型 —— 单一真源
//
// 用途:
//   - 主进程持久化层 (drizzle/chat.ts) 的记录形状
//   - 主进程 → 渲染进程 IPC 流式事件协议
//   - 渲染进程 UI 层的基础类型（叠加纯 UI 态如 streaming）
//
// 引用约定:
//   - 主进程: import type { ... } from "$types/shared/chat.js"
//   - 渲染端: import type { ... } from "$app/shared/chat"
//   - 渲染端只允许 `import type`，不得引入运行时符号
//
// 时间戳约定:
//   统一用 epoch milliseconds (number)。
//   SQLite INTEGER / IPC / dayjs(ms) 全链路兼容，避免字符串时区偏移。

/* ───────── Agent identity ───────── */

export interface AgentIdentity {
    name: string;
    model?: string;
}

/* ───────── Trace tree ───────── */

export type TraceStatus = "pending" | "running" | "success" | "error";

export type TraceNodeKind =
    | "agent"
    | "reasoning"
    | "tool"
    | "source"
    | "step";

interface TraceNodeBase {
    id: string;
    status: TraceStatus;
    /** 单行标题 (动词短语) */
    title: string;
    /** 次要文本：计数、耗时等 */
    description?: string;
    /** 开始时间 epoch ms */
    startedAt?: number;
    /** 结束时间 epoch ms */
    finishedAt?: number;
    /** markdown 详细内容 */
    detail?: string;
    /** detail 是否仍在增量到达；纯 UI 态，不持久化 */
    streaming?: boolean;
}

export interface TraceAgentNode extends TraceNodeBase {
    kind: "agent";
    agent: AgentIdentity;
    children: TraceNode[];
}

export interface TraceReasoningNode extends TraceNodeBase {
    kind: "reasoning";
}

export interface TraceToolNode extends TraceNodeBase {
    kind: "tool";
    toolName: string;
    errorText?: string;
}

export interface TraceSourceNode extends TraceNodeBase {
    kind: "source";
    url: string;
}

export interface TraceStepNode extends TraceNodeBase {
    kind: "step";
    icon?: string;
}

export type TraceNode =
    | TraceAgentNode
    | TraceReasoningNode
    | TraceToolNode
    | TraceSourceNode
    | TraceStepNode;

/**
 * Trace 字段增量更新 patch。
 * 不包含 id/kind/parentId/messageId —— 这些不可变。
 * children 不走 patch，由 (id, parentId) 关系天然决定。
 */
export type TracePatch = Partial<{
    status: TraceStatus;
    title: string;
    description: string;
    detail: string;
    startedAt: number;
    finishedAt: number;
}>;

/* ───────── 持久化记录 ───────── */

/**
 * 聊天会话 (sessions 表)
 */
export interface ChatSession {
    id: string;
    title: string;
    /** 用户是否手动修改过标题；一旦为 true，自动标题逻辑不再触发 */
    titleManual: boolean;
    /** 会话创建时间 epoch ms */
    createdAt: number;
    /** 会话属性最后变更 epoch ms (改标题、消息到达等) */
    updatedAt: number;
    /** 最近一条消息到达时间 epoch ms；用于按活跃度排序 */
    lastMessageAt?: number;
    /** 累计消息数（冗余以免每次扫表） */
    messageCount: number;
}

/**
 * 持久化消息 (messages 表)
 *
 * 注意: `traces` 不是列，仅在 getMessage/listMessages 带 withTraces 时附带返回。
 */
export interface ChatMessage {
    id: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    isError?: boolean;
    /** 消息发生时间 epoch ms；用作会话内自然排序键 */
    timestamp: number;
    agent?: AgentIdentity;
    /** 可选：树形 trace 列表（仅查询时按需填充） */
    traces?: TraceNode[];
}

/**
 * 新建会话的输入
 */
export interface NewChatSession {
    id?: string;
    title?: string;
    /** 是否视为用户手动指定标题；默认 false */
    titleManual?: boolean;
    /** 不传则取 Date.now() */
    createdAt?: number;
}

/**
 * 新建/更新消息的输入
 * 以 id 幂等：若存在则覆盖主体字段
 */
export interface NewChatMessage {
    id?: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    isError?: boolean;
    /** 不传则取 Date.now() */
    timestamp?: number;
    agent?: AgentIdentity;
}

/* ───────── 查询参数 ───────── */

export interface ListSessionsParams {
    pageIndex?: number;
    pageSize?: number;
    /** 默认 lastMessageAt (最近活跃优先) */
    orderBy?: "lastMessageAt" | "updatedAt" | "createdAt";
    orderDir?: "asc" | "desc";
}

export interface ListMessagesParams {
    sessionId: string;
    /** 是否同时加载 traces 树 */
    withTraces?: boolean;
    /** 时间游标: 仅返回 timestamp < before */
    before?: number;
    /** 时间游标: 仅返回 timestamp > after */
    after?: number;
    /** 默认 500；用于防止超大历史一次性拉爆 */
    limit?: number;
    /** 默认 asc (按时间升序，自然对话流) */
    orderDir?: "asc" | "desc";
}

export interface GetMessageOptions {
    withTraces?: boolean;
}

/* ───────── IPC 流式事件协议 ───────── */

export type MessageStreamEvent =
    | {
        type: "message.start";
        messageId: string;
        /** 所属会话 ID；渲染端可据此感知当前会话上下文 */
        sessionId: string;
        /** 由主进程时钟发出的 epoch ms */
        timestamp: number;
        agent?: AgentIdentity;
    }
    | {
        type: "message.delta";
        messageId: string;
        delta: string;
    }
    | {
        type: "message.end";
        messageId: string;
        /** 可选：主进程最终规范化内容。渲染端优先沿用累积结果 */
        content?: string;
        meta?: Record<string, unknown>;
    }
    | {
        type: "message.error";
        messageId: string;
        error: string;
    };

export type TraceStreamEvent =
    | {
        type: "trace.start";
        messageId: string;
        /** 指定则插入到该父节点 children，否则插入消息根 */
        parentId?: string;
        node: TraceNode;
    }
    | {
        type: "trace.update";
        messageId: string;
        nodeId: string;
        /** 增量字段：status / description / finishedAt 等 */
        patch: TracePatch;
    }
    | {
        type: "trace.detail.delta";
        messageId: string;
        nodeId: string;
        delta: string;
    }
    | {
        type: "trace.end";
        messageId: string;
        nodeId: string;
        detail?: string;
    };

export type ChatStreamEvent = MessageStreamEvent | TraceStreamEvent;