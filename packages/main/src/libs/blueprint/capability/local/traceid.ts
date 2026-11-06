// packages/main/src/libs/blueprint/capability/local/traceid.ts
//
// Trace 节点 id 编码规范与序号分配。
//
// 约定：
//   agent       : "agent|<相对路径>"             例: agent|sub/foo
//   builtin工具 : "builtin:<工具id>"             例: builtin:web-search
//   search结果  : "search:<llmName>"             例: search:web_search
//   全局MCP     : "mcp:<serverId>:<工具名>"      例: mcp:brave:search
//   局部MCP     : "mcplocal:<alias>:<工具名>"    例: mcplocal:local:analyze
//   通用步骤    : "step:<uuid>"                  例: step:550e8400-e29b-41d4-a716-446655440000
//   序号后缀    : 若超过首次调用追加 "#<n>"      例: agent|sub/foo#2（同一agent第2次调用）

import type { ToolMeta } from "$libs/tooldb/index.js";
import type { ToolRef } from "./type.js";

/**
 * 下一个序号（1-based）。若首次出现返回 1；之后递增。
 * 内部实现：counters 中若未见过此 key，设为 1；否则 +1。
 */
export function nextSeq(counters: Map<string, number>, key: string): number {
    const current = counters.get(key) ?? 0;
    const next = current + 1;
    counters.set(key, next);
    return next;
}

/**
 * 格式化序号为后缀。首次（seq=1）不附带后缀；之后附带 #n。
 */
function withSeqSuffix(base: string, seq: number): string {
    return seq === 1 ? base : `${base}#${seq}`;
}

/**
 * Agent trace id：agent|<agentId>[#n]
 *
 * @param agentId 来自 compiled.id（相对路径，无扩展名）
 * @param seq 序号（由 nextSeq 分配）
 */
export function agentTraceId(agentId: string, seq: number): string {
    const base = `agent|${agentId}`;
    return withSeqSuffix(base, seq);
}

/**
 * Tool trace id：根据 ToolRef 的 origin 类型编码。
 *
 * @param ref 工具引用
 * @param seq 序号（由 nextSeq 分配）
 */
export function toolTraceId(ref: ToolRef, seq: number): string {
    let base = "";

    switch (ref.origin) {
        case "builtin": {
            const meta = ref.meta as ToolMeta | null;
            const id = meta?.id ?? ref.key;
            base = `builtin:${id}`;
            break;
        }
        case "search": {
            const meta = ref.meta as ToolMeta | null;
            const name = meta?.llmName ?? ref.key;
            base = `search:${name}`;
            break;
        }
        case "mcp_global": {
            const meta = ref.meta as ToolMeta | null;
            const serverId = meta?.serverId ?? "unknown";
            const toolName = meta?.name ?? ref.key;
            base = `mcp:${serverId}:${toolName}`;
            break;
        }
        case "mcp_local": {
            const config = ref.mcpLocal?.config;
            const toolName = ref.mcpLocal?.tool.name ?? ref.key;
            const alias = config?.alias ?? "local";
            base = `mcplocal:${alias}:${toolName}`;
            break;
        }
        case "agent": {
            // agent tools shouldn't call this; but fallback
            const agentId = ref.agent?.id ?? "unknown";
            base = `agent|${agentId}`;
            break;
        }
    }

    return withSeqSuffix(base, seq);
}

/**
 * 通用步骤节点 trace id（用 uuid）
 */
export function stepTraceId(uuid: string): string {
    return `step:${uuid}`;
}

/**
 * Reasoning 节点 trace id。约定附属于某个 agent 节点。
 *
 * @param agentTraceId 父 agent 的 trace id
 */
export function reasoningTraceId(agentTraceId: string): string {
    return `reasoning:${agentTraceId}`;
}