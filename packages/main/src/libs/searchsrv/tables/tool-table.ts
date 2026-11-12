// packages/main/src/libs/searchsrv/tables/tool-table.ts
// tables/tool-table.ts
import type { Schema } from "apache-arrow";
import Logger from "electron-log/main.js";
import { getToolSchema, TOOL_TABLE } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import type { SearchOptions, SearchRow } from "../types.js";

export interface ToolInput {
    id: string;
    name: string;
    description: string;
    text?: string;
    metadata?: Record<string, unknown>;
}

export interface ToolRow extends Record<string, unknown> {
    id: string;
    name: string;
    description: string;
    text: string;
    vector?: number[];
    metadata?: string;
    /** 启用 Rerank 时的精排分数；未启用时不出现。 */
    rerankScore?: number;
    created_at?: string;
    updated_at?: string;
}

/** listToolIds 的过滤条件；source / serverId 均从 metadata JSON 中解析。 */
export interface ToolScope {
    source?: string;
    serverId?: string;
}

/** 单条 SQL 中 IN 的最大 id 数量；过大容易触达解析限制。 */
const DELETE_CHUNK_SIZE = 100;

function parseMetadata(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string" && raw) {
        try {
            const parsed = JSON.parse(raw) as unknown;
            return parsed && typeof parsed === "object"
                ? (parsed as Record<string, unknown>)
                : {};
        } catch {
            return {};
        }
    }
    return raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
}

function toRecords(items: ToolInput[]): SearchRow[] {
    const now = new Date().toISOString();
    return items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        // text 是 schema 必填字段，仅作占位；FTS 不索引它
        text: [item.name, item.description]
            .filter((part) => part.trim().length > 0)
            .join("\n"),
        metadata: JSON.stringify(item.metadata ?? {}),
        created_at: now,
        updated_at: now,
    }));
}

export class ToolTable extends SearchTableBase<ToolRow> {
    constructor(host: SearchDbBase, name = TOOL_TABLE) {
        super(host, name);
    }

    protected schema(vecSize: number): Schema {
        return getToolSchema(vecSize);
    }

    protected ftsColumns(): string[] {
        // tool 没有正文，只检索 name 和 description
        return ["name", "description"];
    }

    /**
     * 全量替换（旧接口，保留兼容）。
     *
     * 注意：这是 replaceAll 语义，会删除未提供的行。
     * 需要按来源 / 服务器增量更新时，请使用 upsertTools / deleteTools / listToolIds。
     */
    async syncTools(items: ToolInput[]): Promise<void> {
        await this.replaceAll(toRecords(items));
    }

    /**
     * 按 id 增量写入：存在则替换，不存在则新增。
     * 不影响未在 items 中出现的行（其他工具保持原样）。
     *
     * 实现为 delete(ids) + add(records)：
     *   - 非原子，但在工具表这类小表上足够；
     *   - 失败时上层可重试，同步逻辑幂等。
     */
    async upsertTools(items: ToolInput[]): Promise<void> {
        if (items.length === 0) return;

        const ids = items.map((item) => item.id);
        await this.deleteTools(ids);
        await this.add(toRecords(items));
    }

    /**
     * 按 id 批量删除。不存在的 id 静默忽略。
     * 分批执行，避免单条 SQL 过长；IN 语法失败时退化为逐条删除。
     */
    async deleteTools(ids: string[]): Promise<void> {
        if (ids.length === 0) return;

        const unique = [
            ...new Set(ids.filter((id) => id.trim().length > 0)),
        ];
        if (unique.length === 0) return;

        const table = this.ensureTable();

        for (let i = 0; i < unique.length; i += DELETE_CHUNK_SIZE) {
            const chunk = unique.slice(i, i + DELETE_CHUNK_SIZE);
            const escaped = chunk
                .map((id) => `'${id.replace(/'/g, "''")}'`)
                .join(",");

            try {
                await table.delete(`id IN (${escaped})`);
            } catch (error) {
                Logger.warn(
                    `[Search] 表 [${this.name}] 批量删除失败，退化为逐条删除:`,
                    error,
                );
                for (const id of chunk) {
                    const single = id.replace(/'/g, "''");
                    await table.delete(`id = '${single}'`);
                }
            }
        }
    }

    /**
     * 按 scope 列出工具 id（仅 select id + metadata，轻量）。
     *
     * - source / serverId 均从 metadata JSON 解析；
     * - 都不传时返回全部 id；
     * - 用于增量同步前 diff，避免 replaceAll 误删其他 scope 的行。
     */
    async listToolIds(scope: ToolScope = {}): Promise<string[]> {
        const rows = (await this.ensureTable()
            .query()
            .select(["id", "metadata"])
            .toArray()) as Array<{
                id: string;
                metadata?: string;
            }>;

        const hasFilter =
            typeof scope.source === "string" ||
            typeof scope.serverId === "string";

        if (!hasFilter) {
            return rows.map((r) => String(r.id));
        }

        return rows
            .filter((r) => {
                const m = parseMetadata(r.metadata);
                if (scope.source && m.source !== scope.source) return false;
                if (scope.serverId && m.serverId !== scope.serverId) {
                    return false;
                }
                return true;
            })
            .map((r) => String(r.id));
    }

    /**
     * 按全局 id 获取工具行。
     *
     * GlobalToolDB.getToolMeta 在检索命中后需要按 id 回表解析工具元数据；
     * MCP 工具不在内存 registry 中，必须通过这里从 LanceDB 取回持久化行。
     */
    async getById(id: string): Promise<ToolRow | null> {
        return this.findById(id);
    }

    /**
     * 按“可引用标识”查找工具行：全局 id、原始 name、metadata.llmName。
     *
     * 额外支持 `mcp:<name>` 这种仅按 MCP 工具函数名引用的简写。
     * 本方法只返回所有候选，不替调用方猜测重名结果；是否唯一、是否可用
     * 由 GlobalToolDB.getToolMeta 判定。重名时必须使用全局 id 或唯一 llmName。
     */
    async findByIdentity(idOrName: string): Promise<ToolRow[]> {
        const raw = idOrName.trim();
        if (!raw) return [];

        const alias =
            raw.startsWith("mcp:") && !raw.startsWith("mcp::")
                ? raw.slice(4).trim()
                : "";

        const rows = (await this.ensureTable()
            .query()
            .select([
                "id",
                "name",
                "description",
                "text",
                "metadata",
                "created_at",
                "updated_at",
            ])
            .toArray()) as ToolRow[];

        const out: ToolRow[] = [];
        for (const row of rows) {
            const metadata = parseMetadata(row.metadata);
            const matches =
                String(row.id) === raw ||
                String(row.name) === raw ||
                String(metadata.llmName ?? "") === raw ||
                (!!alias &&
                    metadata.source === "mcp" &&
                    String(row.name) === alias);

            if (matches) out.push(row);
        }
        return out;
    }

    /**
     * 列出全部工具行，支持分页；不依赖 query（无 FTS / 向量）。
     *
     * - 只 select 必要字段，不读 vector，避免大字段无谓 IO；
     * - offset 在表内应用；limit 必 > 0，否则返回空数组；
     * - 返回行不会带 rerankScore（未经过 rerank 阶段）；
     * - 不做 source 过滤：如需 source 过滤，调用方在结果上二次筛。
     *
     * 这是 `GlobalToolDB.searchTools("")` 的底层原语，也供其它需要
     * 枚举全部工具的场景直接使用。
     */
    async listTools(
        opts: { limit?: number; offset?: number } = {},
    ): Promise<ToolRow[]> {
        const limit = opts.limit ?? 100;
        const offset = opts.offset ?? 0;
        if (limit <= 0) return [];
        if (offset < 0) return [];

        const rows = (await this.ensureTable()
            .query()
            .select(["id", "name", "description", "text", "metadata"])
            .limit(offset + limit)
            .toArray()) as ToolRow[];

        return rows.slice(offset);
    }

    /**
     * tool 检索只依赖 name + description。
     * tool 没有正文，无需聚合；直接返回完整工具条目。
     *
     * 若上层启用 Rerank，返回行会额外携带 `rerankScore`；
     * 断崖截断已在 `SearchTableBase.search` 内完成，本方法不重复截断。
     */
    async searchTools(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<ToolRow[]> {
        return this.search(queryText, {
            mode: "hybrid",
            ...opts,
        });
    }
}