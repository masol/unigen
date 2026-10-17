import { globalToolDB } from "$libs/tooldb/index.js";
import { throwNotfound } from "$libs/utils/err.js";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import type { PacToolConfig } from "./type.js";

/**
 * 外部工具加载:builtin / search / mcp。
 * 全部在编译期完成,与 ctx 无关。
 * agent 类型由 compiler 递归处理,不在此处。
 */
export async function loadExternalTools(
    cfg: Exclude<PacToolConfig, { type: "agent" }>,
): Promise<Record<string, Tool>> {
    switch (cfg.type) {
        case "builtin": {
            const t = globalToolDB.getTool(cfg.id);
            if (!t) throwNotfound(`[PAC] builtin 工具不存在: ${cfg.id}`);
            const meta = globalToolDB.getToolMeta(cfg.id);
            const key = cfg.alias ?? meta?.llmName ?? cfg.id.replace(/^builtin::/, "");
            return { [key]: t };
        }
        case "search": {
            const hits = await globalToolDB.searchTools(cfg.query, {
                limit: cfg.limit ?? 5,
            });
            if (hits.length === 0) {
                Logger.warn(`[PAC] search 未命中任何工具: "${cfg.query}"`);
                return {};
            }
            return globalToolDB.toToolSet(hits);
        }
        case "mcp": {
            const id = `mcp::${cfg.serverId}::${cfg.name}`;
            const t = globalToolDB.getTool(id);
            if (!t) throwNotfound(`[PAC] MCP 工具不存在: ${id}`);
            const meta = globalToolDB.getToolMeta(id);
            const key = cfg.alias ?? meta?.llmName ?? cfg.name;
            return { [key]: t };
        }
    }
}