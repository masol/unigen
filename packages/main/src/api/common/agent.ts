import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { globalToolDB, type ToolMeta } from "$libs/tooldb/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import {
    toolSearchInputSchema,
    toolSearchOutputSchema,
    type ToolSearchItem,
} from "$types/shared/api/agent.js";
import { os } from "@orpc/server";
import Logger from "electron-log/main.js";

/**
 * ToolMeta -> API DTO。
 *
 * 只返回展示所需字段，避免把 schema、内部元数据等大字段跨进程传输。
 */
function toToolSearchItem(meta: ToolMeta): ToolSearchItem {
    const metadata: Record<string, unknown> = {
        source: meta.source,
    };

    if (meta.serverId) {
        metadata.serverId = meta.serverId;
    }

    const rerankScore =
        typeof meta.rerankScore === "number" &&
            Number.isFinite(meta.rerankScore)
            ? meta.rerankScore
            : undefined;

    return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        metadata,
        ...(rerankScore !== undefined ? { rerankScore } : {}),
    };
}

const searchTools = os
    .input(toolSearchInputSchema)
    .output(toolSearchOutputSchema)
    .handler(async ({ input }) => {
        const db = await openGlobalSearch();
        if (!db.opened) {
            throwPrecondition("[Agent] 全局检索库未就绪，无法检索工具。");
        }

        // 多取 1 条判断是否还有下一页，避免额外 count 查询。
        const fetchLimit = input.limit + 1;

        const metas = await globalToolDB.searchTools(input.query, {
            limit: fetchLimit,
            offset: input.offset,
        });

        const hasMore = metas.length > input.limit;
        const items = metas
            .slice(0, input.limit)
            .map((meta) => toToolSearchItem(meta));

        Logger.debug(
            `[Agent] 工具检索完成: query=${JSON.stringify(
                input.query,
            )}, offset=${input.offset}, items=${items.length}, hasMore=${hasMore}`,
        );

        return {
            items,
            hasMore,
        };
    });

export default {
    searchTools,
};