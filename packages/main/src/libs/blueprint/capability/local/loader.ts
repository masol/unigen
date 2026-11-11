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
 */
export async function loadExternalTools(
    cfg: Exclude<PacToolConfig, { type: "agent" }>,
): Promise<LoadResult> {
    switch (cfg.type) {
        case "builtin": {
            await waitToolDB();
            const meta = await globalToolDB.getToolMeta(cfg.id);
            if (!meta) throwNotfound(`[PAC] 全局工具不存在: ${cfg.id}`);
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