// packages/main/src/types/shared/chat.ts
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
//
// Trace 节点 id 编码约定（单一真源，见 libs/blueprint/capability/local/traceid.ts）:
//   agent       : "agent|<相对路径>"          例: agent|sub/foo
//   builtin工具 : "builtin:<工具id>"          例: builtin:web-search
//   search结果  : "search:<llmName>"          例: search:web_search
//   全局MCP     : "mcp:<serverId>:<工具名>"   例: mcp:brave:search
//   局部MCP     : "mcplocal:<alias>:<工具名>" 例: mcplocal:local:analyze
//   技能工具    : "skill:<工具名>"            例: skill:load_skill
//   通用步骤    : "step:<uuid>"               例: step:550e8400-e29b-41d4-a716-446655440000
//   子调用序号  : 基础id后追加 "#<n>"         例: agent|sub/foo#2（同一agent第2次调用）

/* ───────── Agent identity ───────── */

export interface AgentIdentity {
    id: string;
    name: string;
    /** providerId::modelId 格式，例如 "openai::gpt-4o" */
    model?: string;
}

/* ───────── Trace tree ───────── */

export type TraceStatus = "pending" | "running" | "success" | "error";

export type TraceNodeKind =
    | "agent"
    | "reasoning"
    | "tool"
    | "source"
    | "step"
    | "input"
    | "output";

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
    /** 是否为流式节点（默认 true）；false 表示瞬间完整，无需 end */
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

export interface TraceInputNode extends TraceNodeBase {
    kind: "input";
}

export interface TraceOutputNode extends TraceNodeBase {
    kind: "output";
}

export type TraceNode =
    | TraceAgentNode
    | TraceReasoningNode
    | TraceToolNode   // 预留：通用步骤，语义待定
    | TraceSourceNode // 预留：搜索结果、文档引用等场景
    | TraceStepNode
    | TraceInputNode
    | TraceOutputNode;

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
export type { ChatSession } from "./api/chat.js";

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

export type { ListSessionsParams } from "./api/chat.js";


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
        agent: AgentIdentity;
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
        /** 可选：最终 detail 内容（渲染端优先沿用累积结果） */
        detail?: string;
        patch?: TracePatch;
    };

export type ChatStreamEvent = MessageStreamEvent | TraceStreamEvent;