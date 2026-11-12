// packages/main/src/libs/blueprint/capability/local/loader.ts
import { globalToolDB, type ToolMeta } from "$libs/tooldb/index.js";
import { throwNotfound, throwPrecondition } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { probeMcpMetadata } from "./mcp.js";
import type { LocalMcpConfig, LocalMcpToolInfo, PacToolConfig } from "./type.js";

/**
 * 外部工具加载结果,以 kind 区分:
 * - meta:      全局工具库中的工具（builtin / search；若 id 指向 MCP，由 tooldb 负责解析，本层不区分）
 * - mcp_local: 局部 MCP,编译期只拿元数据,运行期再连接
 */
export type LoadResult =
    | { kind: "meta"; tools: Record<string, ToolMeta> }
    | { kind: "mcp_local"; config: LocalMcpConfig; tools: LocalMcpToolInfo[] };

/**
 * 外部工具加载:builtin / search / mcp_local。
 * agent 类型由 compiler 递归处理,不在此处。
 *
 * 全局 MCP 不再作为独立配置类型：agent 侧统一通过 builtin 的全局 id 引用，
 * builtin / mcp 的来源差异由 tooldb 隔离。
 *
 * builtin.id 支持多种可引用标识（按优先级）：
 * - 全局 id（推荐，最稳定）：builtin::xxx / mcp::<serverId>::<name>
 * - 唯一 llmName
 * - 唯一原始 name
 * - 唯一 MCP 简写：mcp:<name>（<name> 即 tool_table.name，MCP 原始函数名）
 *
 * 匹配到多个工具时全部挂载；重名场景建议使用全局 id 或唯一 llmName。
 */
export async function loadExternalTools(
    cfg: Exclude<PacToolConfig, { type: "agent" }>,
): Promise<LoadResult> {
    switch (cfg.type) {
        case "builtin": {
            await waitToolDB();
            const metas = await globalToolDB.getToolMetas(cfg.id);
            if (metas.length === 0) {
                throwNotfound(
                    `[PAC] 全局工具不存在或引用有歧义: ${cfg.id}。` +
                    `MCP 工具可写唯一函数名或 mcp:<函数名>；` +
                    `重名时请使用全局 id（mcp::<serverId>::<name>）或唯一 llmName。`,
                );
            }
            const out: Record<string, ToolMeta> = {};
            const prefix = cfg.alias ? `${cfg.alias}_` : "";
            for (const meta of metas) {
                let key =
                    metas.length === 1
                        ? (cfg.alias ?? meta.llmName)
                        : `${prefix}${meta.llmName}`;
                if (key in out) {
                    let n = 2;
                    while (`${key}_${n}` in out) n++;
                    key = `${key}_${n}`;
                }
                out[key] = meta;
            }
            return { kind: "meta", tools: out };
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
        default: {
            throwPrecondition(
                `[PAC] 不支持的工具类型: ` +
                `${(cfg as unknown as { type?: string }).type ?? "unknown"}。` +
                `全局 MCP 工具请改用 builtin 并填写其全局 id。`,
            );
        }
    }
}

/** 任务加载期编译可能早于工具库 init / 全局 MCP 连接完成 */
async function waitToolDB(): Promise<void> {
    if (!(await globalToolDB.whenReady())) {
        Logger.warn("[PAC] 工具库未在超时内就绪,按当前已注册的工具继续编译");
    }
}