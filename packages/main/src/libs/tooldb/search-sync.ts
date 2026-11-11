// packages/main/src/libs/tooldb/search-sync.ts
import { getGlobalSearchDB } from "$libs/searchsrv/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { globalToolDB } from "./globaltooldb.js";
import { isMetaToolId } from "./tools/meta-tools/registry.js";

/**
 * 将当前 GlobalToolDB 中的 builtin 工具元数据**增量**同步到 searchsrv 的 tool 表。
 *
 * 增量语义：
 *   - 只影响 metadata.source === "builtin" 的行；
 *   - 现存 builtin 行按 id diff：目标里有的 upsert，目标里没有的删除；
 *   - MCP 行完全不受影响（不会再被 replaceAll 误清）。
 *
 * 调用时机：
 * - 系统首次初始化时，在 globalToolDB.init() 且 searchsrv open 之后调用一次；
 * - builtin 工具运行期 register/unregister 后，由外部按需再次调用。
 *
 * 注意：
 * - 不再使用 `syncTools`（全量 replaceAll），因为它会清空未提供的 MCP 行；
 * - 使用 `listBuiltinTools()` 而不是 `searchTools("")`：首次启动时 searchsrv 为空，
 *   必须能同步枚举内存 builtin；
 * - 所有 meta 工具都不入检索表，避免搜索结果自指。
 */
export async function syncToolsToSearchDB(): Promise<void> {
    const db = getGlobalSearchDB();
    if (!db.opened) {
        throwPrecondition("[ToolDB] 检索库未打开，无法同步工具。");
    }

    const targetRows = globalToolDB
        .listBuiltinTools()
        .filter((meta) => !isMetaToolId(meta.id))
        .map((meta) => ({
            // tool 表的 id 列存全局唯一 id（builtin::xxx）
            id: meta.id,
            name: meta.name,
            description: meta.description,
            metadata: {
                llmName: meta.llmName,
                source: meta.source,
                ...(meta.serverId ? { serverId: meta.serverId } : {}),
            },
        }));

    const targetIds = new Set(targetRows.map((r) => r.id));
    const existingIds = await db.tool.listToolIds({ source: "builtin" });
    const toDelete = existingIds.filter((id) => !targetIds.has(id));

    // 先 upsert 目标，再删陈旧——中途失败至少有最新数据可用。
    if (targetRows.length > 0) {
        await db.tool.upsertTools(targetRows);
    }
    if (toDelete.length > 0) {
        await db.tool.deleteTools(toDelete);
    }

    Logger.debug(
        `[ToolDB] builtin 工具同步完成：upsert ${targetRows.length}，` +
        `删除 ${toDelete.length}（MCP 行未受影响）。`,
    );
}