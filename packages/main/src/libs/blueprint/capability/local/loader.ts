import { globalToolDB, type ToolMeta } from "$libs/tooldb/index.js";
import { throwNotfound } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import type { PacToolConfig } from "./type.js";

/**
 * 外部工具加载:builtin / search / mcp。
 *
 * 全部在编译期完成,与 ctx 无关。
 * agent 类型由 compiler 递归处理,不在此处。
 *
 * 统一返回 ToolMeta 而非裸 Tool,好处:
 *  - MCP 工具的 inputSchema/outputSchema 通常只以 JSON Schema 形式挂在
 *    meta.tool.inputSchema.jsonSchema 上,拿着 meta 才能在生成工具目录
 *    (buildToolDoc)时取到结构化参数描述;
 *  - meta.llmName 已由 Registry 保证唯一且合法,直接作为 ToolSet key;
 *  - meta.source / meta.serverId 便于下游诊断。
 */
export async function loadExternalTools(
    cfg: Exclude<PacToolConfig, { type: "agent" }>,
): Promise<Record<string, ToolMeta>> {
    switch (cfg.type) {
        case "builtin": {
            const meta = globalToolDB.getToolMeta(cfg.id);
            if (!meta) throwNotfound(`[PAC] builtin 工具不存在: ${cfg.id}`);
            const key = cfg.alias ?? meta.llmName;
            return { [key]: meta };
        }
        case "search": {
            const hits = await globalToolDB.searchTools(cfg.query, {
                limit: cfg.limit ?? 5,
            });
            if (hits.length === 0) {
                Logger.warn(`[PAC] search 未命中任何工具: "${cfg.query}"`);
                return {};
            }
            // ToolSearchResult 继承自 ToolMeta,原样回传
            const out: Record<string, ToolMeta> = {};
            for (const hit of hits) {
                out[hit.llmName] = hit;
            }
            return out;
        }
        case "mcp": {
            // 保持与 tooldb/naming.ts::mcpId 相同的格式
            const id = `mcp::${cfg.serverId}::${cfg.name}`;
            const meta = globalToolDB.getToolMeta(id);
            if (!meta) throwNotfound(`[PAC] MCP 工具不存在: ${id}`);
            const key = cfg.alias ?? meta.llmName;
            return { [key]: meta };
        }
    }
}