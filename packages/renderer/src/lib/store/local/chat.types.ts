// 聊天领域类型 —— 单一真源
// 依赖方向：markdown ← 此文件 ← msg.svelte.ts & fallback/workbench

import type { MarkdownMessage } from "$lib/components/markdown/type";

/* ───────────────────────────────────────────────
 * Agent identity
 * ─────────────────────────────────────────────── */

export interface AgentIdentity {
    name: string;
    model?: string;
}

/* ───────────────────────────────────────────────
 * Trace 节点（支持 multi-agent 嵌套）
 * ─────────────────────────────────────────────── */

export type TraceStatus = "pending" | "running" | "success" | "error";

export type TraceNodeKind =
    | "agent"      // 子 agent 调用（含模型信息、可嵌套 children）
    | "reasoning"  // 思考/推理
    | "tool"       // 工具调用
    | "source"     // 外部链接
    | "step";      // 通用步骤

interface TraceNodeBase {
    id: string;
    status: TraceStatus;
    /** 单行标题，描述正在/已经发生什么（动词短语） */
    title: string;
    /** 次要文本：计数、耗时等；缺省时 UI 会用 startedAt/finishedAt 自动推导耗时 */
    description?: string;
    /** 开始时间 epoch ms */
    startedAt?: number;
    /** 结束时间 epoch ms */
    finishedAt?: number;
    /** markdown 格式的详细内容（展开后显示） */
    detail?: string;
    /** detail 是否仍在增量到达 */
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
    /** RuntimeIcon 名；缺省用通用图标 */
    icon?: string;
}

export type TraceNode =
    | TraceAgentNode
    | TraceReasoningNode
    | TraceToolNode
    | TraceSourceNode
    | TraceStepNode;

/* ───────────────────────────────────────────────
 * ChatMessage —— UI 层领域对象
 *
 * 结构性兼容 MarkdownMessage，可直接传给 markdown 渲染组件。
 *
 * 持久化约定(主进程 → SQLite):
 *   - timestamp 以 INTEGER 存 epoch ms
 *   - traces 以 JSON 字段存，或拆独立表 (messageId 外键)
 *   - streaming 不持久化（纯 UI 态）
 * ─────────────────────────────────────────────── */

export type ChatMessage = MarkdownMessage & {
    id: string;
    role: "user" | "assistant";
    /** epoch ms —— SQLite INTEGER / IPC 友好 / dayjs 直接接受 */
    timestamp: number;
    /** 内容是否仍在增量到达；完成后置 false */
    streaming?: boolean;
    /** 该助手消息所属的 agent 和模型；user 消息无此字段 */
    agent?: AgentIdentity;
    /** 该回合的 trace 树；支持 multi-agent 嵌套 */
    traces?: TraceNode[];
};

/* ───────────────────────────────────────────────
 * 主进程 → 渲染进程 的流式事件协议
 *
 * 原则：
 *   - 增量优先：delta 事件足以渲染一切
 *   - end 事件可携带最终完整内容做"兜底/规范化"（可选）
 *   - 节点可寻址：trace 节点有稳定 id，可任意层级嵌套
 *   - trace.* 和 message.* 事件可交错到达
 * ─────────────────────────────────────────────── */

export type MessageStreamEvent =
    | {
        type: "message.start";
        messageId: string;
        /** epoch ms；由主进程时钟发出 */
        timestamp: number;
        agent?: AgentIdentity;
    }
    | {
        type: "message.delta";
        messageId: string;
        /** 追加到 content 末尾 */
        delta: string;
    }
    | {
        type: "message.end";
        messageId: string;
        /** 可选：主进程最终规范化内容。渲染端优先沿用累积结果 */
        content?: string;
        /** 可选元数据：usage / finish_reason / 实际模型等 */
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
        patch: Partial<Omit<TraceNode, "id" | "kind" | "children">>;
    }
    | {
        type: "trace.detail.delta";
        messageId: string;
        nodeId: string;
        /** 追加到该节点 detail 末尾 */
        delta: string;
    }
    | {
        type: "trace.end";
        messageId: string;
        nodeId: string;
        /** 可选：最终完整 detail（校验兜底，可省） */
        detail?: string;
    };

export type ChatStreamEvent = MessageStreamEvent | TraceStreamEvent;