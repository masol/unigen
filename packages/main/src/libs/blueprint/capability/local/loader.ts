import { globalToolDB, mcpId, type ToolMeta } from "$libs/tooldb/index.js";
import { throwNotfound } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { probeMcpMetadata } from "./mcp.js";
import type { LocalMcpConfig, LocalMcpToolInfo, PacToolConfig } from "./type.js";

/**
 * 外部工具加载结果,以 kind 区分:
 * - meta:      全局工具库中的工具(builtin / search / 全局 mcp)
 * - mcp_local: 局部 MCP,编译期只拿元数据,运行期再连接
 */
export type LoadResult =
    | { kind: "meta"; tools: Record<string, ToolMeta> }
    | { kind: "mcp_local"; config: LocalMcpConfig; tools: LocalMcpToolInfo[] };

/**
 * 外部工具加载:builtin / search / mcp / mcp_local。
 * agent 类型由 compiler 递归处理,不在此处。
 */
export async function loadExternalTools(
    cfg: Exclude<PacToolConfig, { type: "agent" }>,
): Promise<LoadResult> {
    switch (cfg.type) {
        case "builtin": {
            await waitToolDB();
            const meta = globalToolDB.getToolMeta(cfg.id);
            if (!meta) throwNotfound(`[PAC] builtin 工具不存在: ${cfg.id}`);
            return { kind: "meta", tools: { [cfg.alias ?? meta.llmName]: meta } };
        }
        case "search": {
            await waitToolDB();
            const hits = await globalToolDB.searchTools(cfg.query, { limit: cfg.limit ?? 5 });
            if (hits.length === 0) {
                Logger.warn(`[PAC] search 未命中任何工具: "${cfg.query}"`);
                return { kind: "meta", tools: {} };
            }
            const out: Record<string, ToolMeta> = {};
            for (const hit of hits) out[hit.llmName] = hit;
            return { kind: "meta", tools: out };
        }
        case "mcp": {
            // 全局 MCP:引用 globalToolDB 中已配置的 server
            await waitToolDB();
            const id = mcpId(cfg.server, cfg.tool);
            const meta = globalToolDB.getToolMeta(id);
            if (!meta) {
                const available = globalToolDB
                    .listTools("mcp")
                    .filter((t) => t.serverId === cfg.server)
                    .map((t) => t.name);
                throwNotfound(
                    available.length > 0
                        ? `[PAC] MCP 工具不存在: ${id}。该 server 可用工具: ${available.join(", ")}`
                        : `[PAC] MCP server 未配置、未启用或连接失败: ${cfg.server}`,
                );
            }
            return { kind: "meta", tools: { [cfg.alias ?? meta.llmName]: meta } };
        }
        case "mcp_local": {
            // 局部 MCP:不依赖全局工具库,编译期探测元数据
            const config: LocalMcpConfig = {
                transport: cfg.transport,
                include: cfg.include,
                alias: cfg.alias,
            };
            const tools = await probeMcpMetadata(config);
            return { kind: "mcp_local", config, tools };
        }
    }
}

/** 项目加载期编译可能早于工具库 init / 全局 MCP 连接完成 */
async function waitToolDB(): Promise<void> {
    if (!(await globalToolDB.whenReady())) {
        Logger.warn("[PAC] 工具库未在超时内就绪,按当前已注册的工具继续编译");
    }
}