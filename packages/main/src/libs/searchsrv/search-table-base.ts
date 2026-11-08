import type { Query, Table, VectorQuery } from "@lancedb/lancedb";
import type { Schema } from "apache-arrow";
import Logger from "electron-log/main.js";
import { throwPrecondition } from "../utils/err.js";
import { getGlobalRerankService } from "./global-rerank-service.js";
import { ZERO_VECTOR_META_KEY } from "./metadata-keys.js";
import { createFtsConfig } from "./schema.js";
import type { SearchDbBase } from "./search-db-base.js";
import type { SearchOptions, SearchRow } from "./types.js";

/**
 * 未配置 embed_model 时用于建表的占位向量维度。
 * FTS 仍可正常工作，向量字段写入零向量；后续配置 embedding 会整体重建。
 */
const PLACEHOLDER_VEC_SIZE = 1;

/**
 * 启用 Rerank 时，先多取若干候选，再交给 Rerank 精排。
 * 3 倍是检索场景中较常见的候选扩展倍数。
 */
const RERANK_CANDIDATE_MULTIPLIER = 3;

/** RRF 平滑常数默认值，与 LanceDB RRFReranker 默认值保持一致 */
const DEFAULT_RRF_K = 60;

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

    /**
     * 构造写入记录。
     *
     * 嵌入异常（服务不可用、网络失败、维度不一致等）不得打断入库：
     * 捕获后降级为零向量占位，FTS 索引仍会正常建立；检索侧会因
     * `embedReady` 失效或 `vecSize !== embedSize` 自动走全文检索。
     */
    protected async buildRecords(
        items: SearchRow[],
        opts: {
            fallbackVecSize?: number;
            useEmbedding?: boolean;
        } = {},
    ): Promise<Record<string, unknown>[]> {
        const texts = items.map((item) => String(item.text ?? "").trim());
        if (texts.some((text) => text.length === 0)) {
            throwPrecondition(
                `[Search] 表 [${this.name}] 写入项必须包含非空 text。`,
            );
        }

        const wantEmbedding = opts.useEmbedding !== false;
        let vectors: number[][];
        let usedFallback = false;

        if (wantEmbedding && this.host.embedReady) {
            try {
                vectors = await this.host.doEmbedding(texts, "document");
            } catch (error) {
                Logger.warn(
                    `[Search] 表 [${this.name}] 写入时 Embedding 失败，改用零向量占位，FTS 仍可用。`,
                    error,
                );
                const size =
                    opts.fallbackVecSize ?? (await this.resolveVectorSize());
                vectors = texts.map(() => new Array(size).fill(0));
                usedFallback = true;
            }
        } else {
            const size =
                opts.fallbackVecSize ?? (await this.resolveVectorSize());
            vectors = texts.map(() => new Array(size).fill(0));
            usedFallback = true;
        }

        return items.map((item, index) => ({
            ...item,
            text: texts[index],
            vector: vectors[index],
            metadata: usedFallback
                ? markZeroVector(item.metadata)
                : item.metadata,
        }));
    }

    async add(items: SearchRow[]): Promise<void> {
        if (items.length === 0) return;

        const vecSize = await this.resolveVectorSize();

        let useEmbedding = this.host.embedReady;
        if (useEmbedding && vecSize !== this.host.embedSize) {
            Logger.warn(
                `[Search] 表 [${this.name}] 向量维度(${vecSize})与当前 Embedding 维度(${this.host.embedSize})不一致，本次写入使用零向量占位，FTS 仍可用。`,
            );
            useEmbedding = false;
        }

        const records = await this.buildRecords(items, {
            fallbackVecSize: vecSize,
            useEmbedding,
        });
        await this.ensureTable().add(records);
        await this.ensureIndexes();
    }

    async replaceAll(items: SearchRow[]): Promise<void> {
        if (items.length === 0) {
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
            const records = await this.buildRecords(items, {
                fallbackVecSize: vecSize,
                useEmbedding: this.host.embedReady,
            });
            await staging.add(records);
            await this.ensureIndexes(staging);

            const swapped = await this.trySwapStaging(stagingName);
            if (swapped) {
                this.#vecSize = await this.readVectorSize(this.ensureTable());
                return;
            }

            await this.dropTableIfExists(stagingName);
            await this.drop();

            // 显式按 records 的维度重建表，避免 buildRecords 期间嵌入状态
            // 变化导致 init() 选错占位维度、与 records 维度错位而再次写入失败。
            this.#vecSize = vecSize;
            this.table = await this.createTableNamed(this.name, vecSize);
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

    protected async findById(id: string): Promise<T | null> {
        const trimmed = id.trim();
        if (!trimmed) return null;

        const escaped = trimmed.replace(/'/g, "''");
        const rows = (await this.ensureTable()
            .query()
            .where(`id = '${escaped}'`)
            .limit(1)
            .toArray()) as T[];

        return rows[0] ?? null;
    }

    async search(queryText: string, opts: SearchOptions = {}): Promise<T[]> {
        const limit = opts.limit ?? 10;
        const rerank = getGlobalRerankService();
        const rerankEnabled =
            !opts.disableRerank && (await rerank.isEnabled());

        const candidateLimit = rerankEnabled
            ? Math.max(limit, limit * RERANK_CANDIDATE_MULTIPLIER)
            : limit;

        const query = await this.buildQuery(queryText, {
            ...opts,
            limit: candidateLimit,
        });
        const rows = (await query.toArray()) as T[];

        if (!rerankEnabled || rows.length === 0) {
            return rows.slice(0, limit);
        }

        try {
            const documents = rows.map((row) =>
                String(row.text ?? ""),
            );

            if (documents.some((text) => text.length === 0)) {
                return rows.slice(0, limit);
            }

            const result = await rerank.rerank(queryText, documents, {
                topN: limit,
            });

            const ranked = result.ranking
                .map((item): T | null => {
                    const row = rows[item.originalIndex];
                    if (!row) return null;

                    const score = readRerankScore(item);
                    return score === undefined
                        ? row
                        : { ...row, rerankScore: score };
                })
                .filter((row): row is T => row !== null);

            if (ranked.length === 0) {
                return rows.slice(0, limit);
            }

            return ranked.slice(0, limit);
        } catch (error) {
            Logger.warn(
                `[Search] 表 [${this.name}] Rerank 失败，本次使用未重排结果。`,
                error,
            );
            return rows.slice(0, limit);
        }
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
            excludeZeroVectors = true,
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

        // 向量检索时过滤零向量占位行（基于 vector 列，兼容 LanceDB where 能力）
        const zeroFilter = excludeZeroVectors && canUseVector
            ? zeroVectorFilter()
            : null;
        const combinedFilter = [filter, zeroFilter]
            .filter(Boolean)
            .join(" AND ");

        switch (effectiveMode) {
            case "fts": {
                query = query.fullTextSearch(q, { columns: ftsColumns });
                break;
            }
            case "hybrid": {
                try {
                    const [vector] = await this.host.doEmbedding([q], "query");
                    const rrfK = opts.rrfK ?? DEFAULT_RRF_K;
                    // LanceDB hybrid 链式调用：fullTextSearch + nearestTo 后
                    // 使用内置 RRFReranker 做排名融合，而非向量偏置排序。
                    const rr = await this.host.lanceInst.rerankers
                        .RRFReranker.create(rrfK);
                    query = query
                        .fullTextSearch(q, { columns: ftsColumns })
                        .nearestTo(vector)
                        .rerank(rr);
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

        if (combinedFilter) query = query.where(combinedFilter);
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

// ------------------------------------------------------------
// Rerank 分数与零向量标记
// ------------------------------------------------------------

function readRerankScore(value: unknown): number | undefined {
    if (!value || typeof value !== "object") return undefined;

    const record = value as Record<string, unknown>;
    for (const key of [
        "score",
        "rerankScore",
        "relevanceScore",
        "relevance_score",
    ]) {
        const raw = record[key];
        if (typeof raw === "number" && Number.isFinite(raw)) {
            return raw;
        }
    }

    return undefined;
}

function markZeroVector(metadata: unknown): string {
    if (typeof metadata === "string" && metadata) {
        try {
            const parsed = JSON.parse(metadata) as Record<string, unknown>;
            parsed[ZERO_VECTOR_META_KEY] = true;
            return JSON.stringify(parsed);
        } catch {
            // 非 JSON 字符串：保留原值，不强行改写
            return metadata;
        }
    }
    return JSON.stringify({ [ZERO_VECTOR_META_KEY]: true });
}

/**
 * 基于 vector 列判断零向量。
 *
 * LanceDB 的 where 只能基于列，无法直接判断 JSON metadata。
 * 零向量占位行的 vector 全为 0，用 array_sum 或等价函数可识别。
 * 若当前 LanceDB 版本不支持该函数，调用方可通过
 * SearchOptions.excludeZeroVectors=false 关闭，恢复旧行为。
 */
function zeroVectorFilter(): string {
    // LanceDB SQL 支持 array_has / array_sum 等数组函数；
    // 这里用 array_sum 判断全零，兼容 FixedSizeList 向量列。
    return "array_sum(vector) != 0";
}