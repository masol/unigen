// packages/main/src/libs/tooldb/naming.ts
import type { ToolSource } from "./type.js";

export const builtinId = (name: string) => `builtin::${name}`;
export const mcpId = (serverId: string, name: string) =>
    `mcp::${serverId}::${name}`;

export function makeId(
    source: ToolSource,
    name: string,
    serverId?: string,
): string {
    switch (source) {
        case "builtin":
            return builtinId(name);
        case "mcp":
            if (!serverId) throw new Error("mcp 来源必须提供 serverId");
            return mcpId(serverId, name);
    }
}

/** 收敛为合法 tool name: [a-zA-Z0-9_-]，过长截断 */
export function sanitizeToolName(name: string): string {
    const s = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    return s || "_tool";
}