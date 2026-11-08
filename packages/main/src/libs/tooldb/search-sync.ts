// packages/main/src/libs/tooldb/search-sync.ts
import { getGlobalSearchDB } from "$libs/searchsrv/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { globalToolDB } from "./globaltooldb.js";
import { isMetaToolId } from "./tools/meta-tools/registry.js";

/**
 * 将当前 GlobalToolDB 中的工具元数据全量同步到 searchsrv 的 tool 表。
 *
 * 调用时机：
 * - 系统首次初始化时，在 globalToolDB.init() 且 searchsrv open 之后调用一次；
 * - MCP 配置新增/移除、运行期 register/unregister 后，由外部按需再次调用。
 *
 * 所有 meta 工具都不入检索表，避免搜索结果自指：
 * search_tools / invoke_tool / search_skills / load_skill /
 * search_knowledge_bases / query_knowledge / query_all_knowledge。
 */
export async function syncToolsToSearchDB(): Promise<void> {
    const searchDb = getGlobalSearchDB();
    if (!searchDb.opened) {
        throwPrecondition("[ToolDB] 检索库未打开，无法同步工具。");
    }

    const metas = globalToolDB
        .listTools()
        .filter((meta) => !isMetaToolId(meta.id));

    await searchDb.tool.syncTools(
        metas.map((meta) => ({
            // tool 表的 id 列存全局唯一 id（builtin::xxx / mcp::serverId::xxx）
            id: meta.id,
            name: meta.name,
            description: meta.description,
            metadata: {
                llmName: meta.llmName,
                source: meta.source,
                ...(meta.serverId ? { serverId: meta.serverId } : {}),
            },
        })),
    );

    Logger.debug(`[ToolDB] 已同步 ${metas.length} 个工具到检索库。`);
}