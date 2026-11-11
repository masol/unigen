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
     * tool 检索只依赖 name + description。
     * tool 没有正文，无需聚合；直接返回完整工具条目。
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