// 类型守卫 —— TraceNode discriminated union 的运行时类型收窄工具
//
// 用途：
//   - 在处理 TraceNode 时提供类型安全的属性访问
//   - 避免 `as` 断言的类型不安全
//   - 提供 IDE 自动补全支持

import type {
    TraceAgentNode,
    TraceInputNode,
    TraceNode,
    TraceOutputNode,
    TraceReasoningNode,
    TraceSourceNode,
    TraceStepNode,
    TraceToolNode
} from "./chat.types";

export function isTraceAgentNode(node: TraceNode): node is TraceAgentNode {
    return node.kind === "agent";
}

export function isTraceReasoningNode(
    node: TraceNode,
): node is TraceReasoningNode {
    return node.kind === "reasoning";
}

export function isTraceToolNode(node: TraceNode): node is TraceToolNode {
    return node.kind === "tool";
}

export function isTraceSourceNode(node: TraceNode): node is TraceSourceNode {
    return node.kind === "source";
}

export function isTraceStepNode(node: TraceNode): node is TraceStepNode {
    return node.kind === "step";
}

export function isTraceInputNode(node: TraceNode): node is TraceInputNode {
    return node.kind === "input";
}

export function isTraceOutputNode(node: TraceNode): node is TraceOutputNode {
    return node.kind === "output";
}

/**
 * 判断节点是否为可展开类型（拥有 children 属性）
 */
export function hasTraceChildren(
    node: TraceNode,
): node is TraceAgentNode {
    return isTraceAgentNode(node);
}