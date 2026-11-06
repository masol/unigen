import type { Query, Table, VectorQuery } from "@lancedb/lancedb";
import type { Schema } from "apache-arrow";
import Logger from "electron-log/main.js";
import { throwPrecondition } from "../utils/err.js";
import { createFtsConfig } from "./schema.js";
import type { SearchDbBase } from "./search-db-base.js";
import type { SearchOptions, SearchRow } from "./types.js";

/**
 * 未配置 embed_model 时用于建表的占位向量维度。
 * FTS 仍可正常工作，向量字段写入零向量；后续配置 embedding 会整体重建。
 */
const PLACEHOLDER_VEC_SIZE = 1;

type RenameableConnection = {
    renameTable?: (from: string, to: string) => Promise<void>;
};

export abstract class SearchTableBase<
    T extends Record<string, unknown> = Record<string, unknown>,
> {
    protected table: Table | null = null;
    readonly name: string;

    /** 当前表的向量维度；init / 交换后从 schema 读取 */
    #vecSize: number | null = null;

    constructor(
        protected readonly host: SearchDbBase,
        name: string,
    ) {
        this.name = name;
    }

    protected abstract schema(vecSize: number): Schema;

    protected ftsColumns(): string[] {
        return ["text"];
    }

    close(): void {
        if (!this.table) return;
        try {
            this.table.close();
        } catch (error) {
            Logger.warn(`[Search] 表 [${this.name}] 关闭异常:`, error);
        }
        this.table = null;
        this.#vecSize = null;
    }

    async init(): Promise<void> {
        if (this.table) return;

        const names = await this.host.db.tableNames();
        if (names.includes(this.name)) {
            this.table = await this.host.db.openTable(this.name);
            this.#vecSize = await this.readVectorSize(this.table);
            return;
        }

        await this.createTable();
    }

    protected async createTable(): Promise<void> {
        const vecSize = this.host.embedReady
            ? this.host.embedSize
            : PLACEHOLDER_VEC_SIZE;

        this.#vecSize = vecSize;
        this.table = await this.createTableNamed(this.name, vecSize);
    }

    protected async createTableNamed(
        name: string,
        vecSize: number,
    ): Promise<Table> {
        const table = await this.host.db.createEmptyTable(
            name,
            this.schema(vecSize),
        );

        await this.ensureIndexes(table);
        return table;
    }

    protected async ensureIndexes(
        table: Table = this.ensureTable(),
    ): Promise<void> {
        try {
            await table.createIndex("id", {
                config: this.host.lanceInst.Index.btree(),
                replace: true,
            });
        } catch (error) {
            Logger.warn(
                `[Search] 表 [${this.name}] 创建 id 索引失败:`,
                error,
            );
        }

        for (const column of this.ftsColumns()) {
            try {
                await table.createIndex(column, {
                    config: createFtsConfig(this.host.lanceInst),
                    replace: true,
                });
            } catch (error) {
                Logger.warn(
                    `[Search] 表 [${this.name}] 创建 FTS(${column}) 索引失败:`,
                    error,
                );
            }
        }
    }

    /**
     * 从表 arrow schema 的 vector 字段读取维度。
     * LanceDB 的 table.schema 是返回 Promise<Schema> 的函数，必须 await。
     */
    private async readVectorSize(table: Table): Promise<number> {
        try {
            const schema = await table.schema();
            const field = schema.fields.find((f) => f.name === "vector");
            if (!field) return PLACEHOLDER_VEC_SIZE;

            const type = field.type as unknown as { listSize?: number };
            const size = type?.listSize ?? 0;
            return size > 0 ? size : PLACEHOLDER_VEC_SIZE;
        } catch {
            return PLACEHOLDER_VEC_SIZE;
        }
    }

    private async resolveVectorSize(): Promise<number> {
        if (this.#vecSize !== null && this.#vecSize > 0) {
            return this.#vecSize;
        }
        this.#vecSize = await this.readVectorSize(this.ensureTable());
        return this.#vecSize;
    }

    ensureTable(): Table {
        if (!this.table) {
            throwPrecondition(`[Search] 表 [${this.name}] 未初始化。`);
        }
        return this.table;
    }

    protected async buildRecords(
        items: SearchRow[],
    ): Promise<Record<string, unknown>[]> {
        const texts = items.map((item) => String(item.text ?? "").trim());
        if (texts.some((text) => text.length === 0)) {
            throwPrecondition(
                `[Search] 表 [${this.name}] 写入项必须包含非空 text。`,
            );
        }

        let vectors: number[][];

        if (this.host.embedReady) {
            vectors = await this.host.doEmbedding(texts, "document");
        } else {
            // 未配置 embed_model：用零向量占位，保持 schema 兼容
            const size = await this.resolveVectorSize();
            vectors = texts.map(() => new Array(size).fill(0));
        }

        return items.map((item, index) => ({
            ...item,
            text: texts[index],
            vector: vectors[index],
        }));
    }

    async add(items: SearchRow[]): Promise<void> {
        if (items.length === 0) return;

        if (this.host.embedReady) {
            const vecSize = await this.resolveVectorSize();
            if (vecSize !== this.host.embedSize) {
                throwPrecondition(
                    `[Search] 表 [${this.name}] 向量维度(${vecSize})与当前 Embedding 维度(${this.host.embedSize})不一致，请先重建索引。`,
                );
            }
        }

        const records = await this.buildRecords(items);
        await this.ensureTable().add(records);
        await this.ensureIndexes();
    }

    async replaceAll(items: SearchRow[]): Promise<void> {
        if (items.length === 0) {
            // 清空数据但不重建表：保留 schema / 索引
            await this.ensureTable().delete("true");
            return;
        }

        const stagingName = `${this.name}__rebuild_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        try {
            const vecSize = this.host.embedReady
                ? this.host.embedSize
                : await this.resolveVectorSize();

            const staging = await this.createTableNamed(stagingName, vecSize);
            const records = await this.buildRecords(items);
            await staging.add(records);
            await this.ensureIndexes(staging);

            const swapped = await this.trySwapStaging(stagingName);
            if (swapped) {
                this.#vecSize = await this.readVectorSize(this.ensureTable());
                return;
            }

            await this.dropTableIfExists(stagingName);
            await this.drop();
            await this.init();
            await this.ensureTable().add(records);
            await this.ensureIndexes();
        } catch (error) {
            await this.dropTableIfExists(stagingName);
            throw error;
        }
    }

    private async trySwapStaging(stagingName: string): Promise<boolean> {
        const db = this.host.db as unknown as RenameableConnection;
        if (typeof db.renameTable !== "function") {
            return false;
        }

        const backup = `${this.name}__old_${Date.now()}`;
        const names = await this.host.db.tableNames();
        const hadCurrent = names.includes(this.name);

        try {
            if (hadCurrent) {
                await db.renameTable(this.name, backup);
            }
            await db.renameTable(stagingName, this.name);

            this.close();
            this.table = await this.host.db.openTable(this.name);

            if (hadCurrent) {
                await this.host.db.dropTable(backup).catch(() => undefined);
            }
            return true;
        } catch (error) {
            Logger.warn(
                `[Search] 表 [${this.name}] staging 交换失败，回退重建:`,
                error,
            );

            try {
                const now = await this.host.db.tableNames();
                if (
                    hadCurrent &&
                    now.includes(backup) &&
                    !now.includes(this.name)
                ) {
                    await db.renameTable(backup, this.name);
                }
            } catch {
                // ignore rollback failure
            }

            await this.dropTableIfExists(stagingName);
            if (hadCurrent) {
                await this.dropTableIfExists(backup);
            }
            return false;
        }
    }

    async rebuild(rows: T[]): Promise<void> {
        const searchable = rows.filter((row) => {
            const text = row["text"];
            return typeof text === "string" && text.trim().length > 0;
        }) as SearchRow[];

        await this.replaceAll(searchable);
    }

    async queryAll(): Promise<T[]> {
        return (await this.ensureTable().query().toArray()) as T[];
    }

    async search(queryText: string, opts: SearchOptions = {}): Promise<T[]> {
        const query = await this.buildQuery(queryText, opts);
        return (await query.toArray()) as T[];
    }

    async buildQuery(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<Query | VectorQuery> {
        const {
            mode = "vector",
            limit = 10,
            ftsColumn,
            filter,
            select,
        } = opts;

        const q = (queryText ?? "").trim();
        if (!q) {
            throwPrecondition("[Search] queryText 不能为空。");
        }

        const table = this.ensureTable();

        let canUseVector = this.host.embedReady && !this.host.rebuilding;
        if (canUseVector) {
            const vecSize = await this.resolveVectorSize();
            canUseVector = vecSize === this.host.embedSize;
        }

        const effectiveMode =
            mode !== "fts" && !canUseVector ? "fts" : mode;

        const ftsColumns = ftsColumn ? [ftsColumn] : this.ftsColumns();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = table.query();

        switch (effectiveMode) {
            case "fts": {
                query = query.fullTextSearch(q, { columns: ftsColumns });
                break;
            }
            case "hybrid": {
                try {
                    const [vector] = await this.host.doEmbedding([q], "query");
                    query = query
                        .fullTextSearch(q, { columns: ftsColumns })
                        .nearestTo(vector);
                } catch (error) {
                    Logger.warn(
                        `[Search] 表 [${this.name}] 混合检索失败，本次退化为全文检索。`,
                        error,
                    );
                    query = query.fullTextSearch(q, { columns: ftsColumns });
                }
                break;
            }
            case "vector":
            default: {
                try {
                    const [vector] = await this.host.doEmbedding([q], "query");
                    query = query.nearestTo(vector);
                } catch (error) {
                    Logger.warn(
                        `[Search] 表 [${this.name}] 向量检索失败，本次退化为全文检索。`,
                        error,
                    );
                    query = query.fullTextSearch(q, { columns: ftsColumns });
                }
                break;
            }
        }

        if (filter) query = query.where(filter);
        if (select?.length) query = query.select(select);

        return query.limit(limit) as Query | VectorQuery;
    }

    private async dropTableIfExists(name: string): Promise<void> {
        try {
            await this.host.db.dropTable(name);
        } catch {
            // ignore
        }
    }

    async drop(): Promise<void> {
        this.close();
        try {
            await this.host.db.dropTable(this.name);
        } catch (error) {
            Logger.warn(
                `[Search] 删除表 [${this.name}] 失败或表不存在:`,
                error,
            );
        }
    }
}