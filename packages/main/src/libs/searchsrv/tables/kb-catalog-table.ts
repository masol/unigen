// tables/kb-catalog-table.ts
import type { Schema } from "apache-arrow";
import { getKbCatalogSchema, KB_CATALOG_TABLE } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import type { SearchOptions } from "../types.js";

/** 知识库目录行。不含 chunk，只描述“这个库是什么”。 */
export interface KbCatalogRow extends Record<string, unknown> {
    id: string;
    name: string;
    description: string;
    /** 由 name + description 拼接，仅用于 embedding，不对外暴露语义。 */
    text: string;
    vector?: number[];
    /** 检索时若启用 Rerank，会附带精排分数；未启用时不存在。 */
    rerankScore?: number;
    created_at?: string;
    updated_at?: string;
}

/**
 * 知识库目录表：只存 name/description，供 AI 先搜索选库。
 * 与 SkillTable 的渐进式披露逻辑一致——描述决定“是否加载”，
 * 真正的 chunk 检索发生在选定库之后。
 */
export class KbCatalogTable extends SearchTableBase<KbCatalogRow> {
    constructor(host: SearchDbBase, name = KB_CATALOG_TABLE) {
        super(host, name);
    }

    protected schema(vecSize: number): Schema {
        return getKbCatalogSchema(vecSize);
    }

    protected ftsColumns(): string[] {
        return ["name", "description"];
    }

    /** 追加一条目录项。id 由调用方提供，重复 id 不会自动去重。 */
    async addCatalogEntry(entry: {
        id: string;
        name: string;
        description: string;
    }): Promise<void> {
        const now = new Date().toISOString();
        await this.add([
            {
                id: entry.id,
                name: entry.name,
                description: entry.description,
                text: `${entry.name}\n${entry.description}`,
                created_at: now,
                updated_at: now,
            },
        ]);
    }

    /**
     * 全量同步知识库目录。
     * 用于目录扫描初始化，删除不再存在的目录项。
     */
    async syncCatalog(
        entries: Array<{
            id: string;
            name: string;
            description: string;
        }>,
    ): Promise<void> {
        const now = new Date().toISOString();

        await this.replaceAll(
            entries.map((entry) => ({
                id: entry.id,
                name: entry.name,
                description: entry.description,
                text: `${entry.name}\n${entry.description}`,
                created_at: now,
                updated_at: now,
            })),
        );
    }

    /**
     * 按 name/description 检索知识库目录，返回候选知识库。
     * 不返回 chunk；调用方拿到 id 后应转向对应 KbTable.searchChunks。
     */
    async searchCatalog(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<KbCatalogRow[]> {
        return this.search(queryText, {
            mode: "hybrid",
            ...opts,
        });
    }

    /** 按 id 获取目录项。 */
    async getById(id: string): Promise<KbCatalogRow | null> {
        return this.findById(id);
    }

    /**
     * 全量目录项，按 name/id 稳定排序。
     * 只取目录字段，不读取 vector，避免无谓开销。
     */
    async listEntries(): Promise<KbCatalogRow[]> {
        const rows = (await this.ensureTable()
            .query()
            .select([
                "id",
                "name",
                "description",
                "text",
                "created_at",
                "updated_at",
            ])
            .toArray()) as KbCatalogRow[];

        return rows.sort(
            (a, b) =>
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id),
        );
    }
}