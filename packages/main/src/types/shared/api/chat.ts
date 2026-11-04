import { z } from "zod";

export const listSessionsParamsSchema = z.object({
    pageIndex: z.number().optional(),
    pageSize: z.number().optional(),
    orderBy: z.enum(["lastMessageAt", "updatedAt", "createdAt"]).optional(),
    orderDir: z.enum(["asc", "desc"]).optional(),
});

export type ListSessionsParams = z.infer<typeof listSessionsParamsSchema>;

/** epoch ms：整数且非负 */
const epochMs = z.number().int().nonnegative();

export const chatSessionSchema = z.object({
    id: z.string().min(1),
    title: z.string(),
    /** 用户是否手动修改过标题；一旦为 true，自动标题逻辑不再触发 */
    titleManual: z.boolean(),
    /** 会话创建时间 epoch ms */
    createdAt: epochMs,
    /** 会话属性最后变更 epoch ms (改标题、消息到达等) */
    updatedAt: epochMs,
    /** 最近一条消息到达时间 epoch ms；用于按活跃度排序 */
    lastMessageAt: epochMs.optional(),
    /** 累计消息数（冗余以免每次扫表） */
    messageCount: z.number().int().nonnegative(),
});

export type ChatSession = z.infer<typeof chatSessionSchema>;



export const listMessagesParamsSchema = z.object({
    sessionId: z.string(),
    /** 是否同时加载 traces 树 */
    withTraces: z.boolean().optional(),
    /** 时间游标: 仅返回 timestamp < before */
    before: z.number().optional(),
    /** 时间游标: 仅返回 timestamp > after */
    after: z.number().optional(),
    /** 默认 500；用于防止超大历史一次性拉爆 */
    limit: z.number().optional(),
    /** 默认 asc (按时间升序，自然对话流) */
    orderDir: z.enum(["asc", "desc"]).optional(),
});

export type ListMessagesParams = z.infer<typeof listMessagesParamsSchema>;

export type SessionPatch = Partial<Omit<ChatSession, 'id'>> & Pick<ChatSession, 'id'>

// ChatMessage相关类型:

/* ───── 原始接口：保持原样，作为 schema 的标注类型使用 ───── */

export interface AgentIdentity {
    id: string;
    name: string;
    /** providerId::modelId 格式，例如 "openai::gpt-4o" */
    model?: string;
}

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
    | TraceToolNode
    | TraceSourceNode
    | TraceStepNode
    | TraceInputNode
    | TraceOutputNode;

/* ───── Zod Schemas ───── */

// 注意：所有参与递归的 schema 都同时标注 <Output, Input>，
// 避免 Zod 4 将 Input 默认成 unknown 导致 _input 不兼容。

export const agentIdentitySchema: z.ZodType<AgentIdentity, AgentIdentity> =
    z.object({
        id: z.string(),
        name: z.string(),
        model: z.string().optional(),
    });

export const traceStatusSchema: z.ZodType<TraceStatus, TraceStatus> = z.enum([
    "pending",
    "running",
    "success",
    "error",
]);

export const traceNodeKindSchema: z.ZodType<TraceNodeKind, TraceNodeKind> =
    z.enum(["agent", "reasoning", "tool", "source", "step", "input", "output"]);

/** 与 TraceNodeBase 一一对应的公共字段 shape */
const traceNodeBaseShape = {
    id: z.string(),
    status: traceStatusSchema,
    title: z.string(),
    description: z.string().optional(),
    startedAt: z.number().optional(),
    finishedAt: z.number().optional(),
    detail: z.string().optional(),
    streaming: z.boolean().optional(),
};

export const traceAgentNodeSchema: z.ZodType<TraceAgentNode, TraceAgentNode> =
    z.object({
        ...traceNodeBaseShape,
        kind: z.literal("agent"),
        agent: agentIdentitySchema,
        // 递归：z.lazy 延迟运行时求值；类型锚点由 traceNodeSchema 的显式标注提供
        children: z.lazy(() => z.array(traceNodeSchema)),
    });

export const traceReasoningNodeSchema: z.ZodType<
    TraceReasoningNode,
    TraceReasoningNode
> = z.object({
    ...traceNodeBaseShape,
    kind: z.literal("reasoning"),
});

export const traceToolNodeSchema: z.ZodType<TraceToolNode, TraceToolNode> =
    z.object({
        ...traceNodeBaseShape,
        kind: z.literal("tool"),
        toolName: z.string(),
        errorText: z.string().optional(),
    });

export const traceSourceNodeSchema: z.ZodType<TraceSourceNode, TraceSourceNode> =
    z.object({
        ...traceNodeBaseShape,
        kind: z.literal("source"),
        url: z.string(),
    });

export const traceStepNodeSchema: z.ZodType<TraceStepNode, TraceStepNode> =
    z.object({
        ...traceNodeBaseShape,
        kind: z.literal("step"),
        icon: z.string().optional(),
    });

export const traceInputNodeSchema: z.ZodType<TraceInputNode, TraceInputNode> =
    z.object({
        ...traceNodeBaseShape,
        kind: z.literal("input"),
    });

export const traceOutputNodeSchema: z.ZodType<TraceOutputNode, TraceOutputNode> =
    z.object({
        ...traceNodeBaseShape,
        kind: z.literal("output"),
    });

/**
 * 顶层递归联合。
 *
 * - 使用 z.union 而非 z.discriminatedUnion：Zod 4 中 discriminatedUnion 在递归
 *   场景下会因提前解析判别键而让类型坍缩成 any/unknown；z.union 惰性展开，能正确
 *   处理递归。
 * - 显式标注 <TraceNode, TraceNode>：同时固定 Output 和 Input，消除 _input 不兼容。
 */
export const traceNodeSchema: z.ZodType<TraceNode, TraceNode> = z.lazy(() =>
    z.union([
        traceAgentNodeSchema,
        traceReasoningNodeSchema,
        traceToolNodeSchema,
        traceSourceNodeSchema,
        traceStepNodeSchema,
        traceInputNodeSchema,
        traceOutputNodeSchema,
    ]),
);

/* ───── ChatMessage：仍然从 schema 导出类型 ───── */

export const chatMessageSchema = z.object({
    id: z.string(),
    sessionId: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    /** 相对项目根目录的文件路径数组 */
    files: z.array(z.string()).default([]).optional(),
    isError: z.boolean().optional(),
    /** 消息模式：
      *  - 不传 / null / undefined：默认，参与历史记录
      *  - "cmd"：命令类消息，不参与历史记录
    */
    mode: z.enum(["cmd"]).nullish(),
    /** 消息发生时间 epoch ms；用作会话内自然排序键 */
    timestamp: z.number(),
    agent: agentIdentitySchema.optional(),
    /** 可选：树形 trace 列表（仅查询时按需填充） */
    traces: z.array(traceNodeSchema).optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;



export const newChatMessageSchema = z.object({
    id: z.string().optional(),
    sessionId: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    /** 相对项目根目录的文件路径数组 */
    files: z.array(z.string()).optional(),
    isError: z.boolean().optional(),
    /** 消息模式：
         *  - 不传 / null / undefined：默认，参与历史记录
         *  - "cmd"：命令类消息，不参与历史记录
    */
    mode: z.enum(["cmd"]).nullish(),
    /** 不传则取 Date.now() */
    timestamp: z.number().optional(),
    agent: agentIdentitySchema.optional(),
});

export type NewChatMessage = z.infer<typeof newChatMessageSchema>;