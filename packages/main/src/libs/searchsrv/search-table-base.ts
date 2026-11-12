// search-table-base.ts
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

/**
 * 断崖检测的固定参数。
 *
 * - MIN_TOP_K：即使断崖很早，也至少保留这么多条，避免空结果；
 * - GAP_ABS_MULTIPLIER：相邻 gap 超过平均 gap 的倍数，视为断崖；
 * - GAP_REL_RATIO：相邻 gap / 当前分 的相对比例下限，避免整体分数接近时误判。
 *
 * 这里没有绝对 minScore：rerank 分数是排序信号，不具备跨查询可比性。
 * 断崖由当前候选集分布决定，不使用全局固定阈值。
 */
const GAP_MIN_TOP_K = 2;
const GAP_ABS_MULTIPLIER = 2;
const GAP_REL_RATIO = 0.2;

const RENAME_UNSUPPORTED_KEY = Symbol.for(
    "unigen.singleton.renameTableUnsupported",
);

interface RenameTableState {
    unsupported: boolean;
}

function getRenameTableState(): RenameTableState {
    const g = globalThis as unknown as Record<
        symbol,
        RenameTableState | undefined
    >;
    return (g[RENAME_UNSUPPORTED_KEY] ??= { unsupported: false });
}

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

    /**
     * 正在进行的后台重建。
     * 用于防重入：多个检索同时发现维度不一致时，只触发一次重建。
     */
    #aligning: Promise<void> | null = null;

    /**
     * 已排队但尚未开始执行的后台重建。
     * requestAlign 用 setTimeout(..., 0) 让出当前 tick，避免打断正在
     * toArray 的 query；在 setTimeout 回调执行前，新的检索命中本字段
     * 会被直接吞掉，不会重复排队。
     */
    #alignPending = false;

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
     * 请求后台重建（fire-and-forget）。
     *
     * 使用场景：检索路径发现「表维度 ≠ embedSize」。这是语义检索
     * 静默退化最典型的原因（首次无 embed 时建的表、appliedState 与
     * 实际 schema 漂移等），如果不主动修复，会永远降级为全文检索，
     * 且只在 debug 日志里可见。
     *
     * 特性：
     * - 用 setTimeout(..., 0) 让出当前 tick：buildQuery 调用 requestAlign
     *   后本次检索仍会 toArray 完成，不会被 close/drop 打断；
     * - #alignPending / #aligning 双重防重入：并发检索只触发一次；
     * - 只做一次 warn（不是每次检索都 warn），避免日志刷屏；
     * - 重建失败打 error 但不再自动重试，避免无限循环；下次 embed 变化
     *   或重启会再次走到 onEmbeddingReady → alignVectorSize。
     *
     * 不 await：调用方（buildQuery）本次检索继续走 FTS 返回。
     */
    requestAlign(reason: string): void {
        if (this.#aligning || this.#alignPending) return;
        if (!this.host.embedReady) return;
        if (this.host.rebuilding) return;

        this.#alignPending = true;

        Logger.warn(
            `[Search] 表 [${this.name}] 检测到向量维度不一致（${reason}），` +
            `本次检索降级为全文检索，已排队后台重建。`,
        );

        setTimeout(() => {
            void this.#runAlign(reason);
        }, 0);
    }

    async #runAlign(reason: string): Promise<void> {
        if (this.#aligning) return;

        this.#aligning = (async () => {
            try {
                await this.alignVectorSize();
                Logger.info(
                    `[Search] 表 [${this.name}] 后台重建完成（原因：${reason}）。`,
                );
            } catch (error) {
                Logger.error(
                    `[Search] 表 [${this.name}] 后台重建失败，检索将继续降级为全文检索。`,
                    error,
                );
            } finally {
                this.#aligning = null;
                this.#alignPending = false;
            }
        })();

        await this.#aligning;
    }

    /**
     * 自愈：检查已存在表的向量维度是否与当前 embedSize 一致。
     *
     * 背景：首次启动时若未配置 embed_model，表会以 1 维占位创建；
     * 之后配置 embed_model，onEmbeddingChanged 只在「applied state 变化」
     * 时触发，且 apply 后会被记录，下次启动不再检查。如果那次重建时表
     * 为空（replaceAll([]) 的旧实现只 delete("true") 不重建 schema），
     * 表会一直停留在 1 维，后续 add 全部落零向量、buildQuery 全部降级
     * 为 FTS —— 这就是「配了 embedding 但检索像全文」的根因。
     *
     * 本方法在每次 embed 就绪时（onEmbeddingReady）调用：
     * - embed 未就绪：直接 return，不动表；
     * - 维度一致：一次 schema 读，零成本；
     * - 维度不一致：按当前 embedSize 重建（无数据则新建空表，
     *   有数据则 rebuild 全量重算向量）。
     *
     * 也由 requestAlign 在检索路径触发，作为 onEmbeddingReady 漏跑
     * 时的兜底。
     */
    async alignVectorSize(): Promise<void> {
        if (!this.host.embedReady) return;

        const current = await this.resolveVectorSize();
        if (current === this.host.embedSize) return;

        const rows = await this.queryAll();

        Logger.warn(
            `[Search] 表 [${this.name}] 维度(${current})与 embedSize(${this.host.embedSize}) 不一致，` +
            `行数=${rows.length}，开始按新维度重建。`,
        );

        if (rows.length === 0) {
            await this.drop();
            this.#vecSize = this.host.embedSize;
            this.table = await this.createTableNamed(
                this.name,
                this.host.embedSize,
            );
            Logger.debug(
                `[Search] 表 [${this.name}] 已按 ${this.host.embedSize} 重建为空表。`,
            );
            return;
        }

        await this.rebuild(rows);
        Logger.debug(
            `[Search] 表 [${this.name}] 已按 ${this.host.embedSize} 重建，行数=${rows.length}。`,
        );
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

        if (usedFallback) {
            Logger.debug(
                `[Search] 表 [${this.name}] 本次写入 ${texts.length} 行使用零向量占位。`,
            );
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

        Logger.debug(
            `[Search] 表 [${this.name}] 追加写入 ${records.length} 行，` +
            `vecSize=${vecSize}，requestedEmbedding=${useEmbedding}。`,
        );

        await this.ensureTable().add(records);
        await this.ensureIndexes();
    }

    async replaceAll(items: SearchRow[]): Promise<void> {
        if (items.length === 0) {
            // 空数组同步是修复"表维度停留在占位维度"的兜底窗口。
            // 主修复在 alignVectorSize（onEmbeddingReady / requestAlign），
            // 这里保留兜底，避免 embed 就绪后 sync 空目录时表维度仍然错位。
            const needRebuild =
                this.host.embedReady &&
                (await this.resolveVectorSize()) !== this.host.embedSize;

            if (needRebuild) {
                const vecSize = this.host.embedSize;
                Logger.debug(
                    `[Search] 表 [${this.name}] 空数组 replaceAll：表维度与 embedSize 不一致，按 ${vecSize} 重建空表。`,
                );
                await this.drop();
                this.#vecSize = vecSize;
                this.table = await this.createTableNamed(this.name, vecSize);
                return;
            }

            Logger.debug(
                `[Search] 表 [${this.name}] 全量替换为空，清空数据。`,
            );
            await this.ensureTable().delete("true");
            return;
        }

        Logger.debug(
            `[Search] 表 [${this.name}] 全量替换开始，输入 ${items.length} 行，` +
            `embedReady=${this.host.embedReady}。`,
        );

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

            Logger.debug(
                `[Search] 表 [${this.name}] staging 写入 ${records.length} 行，` +
                `vecSize=${vecSize}，embedReady=${this.host.embedReady}。`,
            );

            await this.ensureIndexes(staging);

            const swapped = await this.trySwapStaging(stagingName);
            if (swapped) {
                this.#vecSize = await this.readVectorSize(this.ensureTable());
                Logger.debug(
                    `[Search] 表 [${this.name}] 全量替换完成，行数=${records.length}，` +
                    `vecSize=${this.#vecSize}。`,
                );
                return;
            }

            await this.dropTableIfExists(stagingName);
            await this.drop();

            // 显式按 records 的维度重建表，避免 buildRecords 期间嵌入状态
            // 变化导致 init() 选错占位维度、与 records 维度错位而再次写入失败。
            this.#vecSize = vecSize;
            this.table = await this.createTableNamed(this.name, vecSize);
            await this.ensureTable().add(records);

            Logger.debug(
                `[Search] 表 [${this.name}] fallback 重建写入 ${records.length} 行，` +
                `vecSize=${vecSize}。`,
            );

            await this.ensureIndexes();
        } catch (error) {
            await this.dropTableIfExists(stagingName);
            throw error;
        }
    }

    private async trySwapStaging(stagingName: string): Promise<boolean> {
        const state = getRenameTableState();
        if (state.unsupported) {
            return false;
        }

        const db = this.host.db as unknown as RenameableConnection;
        if (typeof db.renameTable !== "function") {
            state.unsupported = true;
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
            if (isRenameTableUnsupportedError(error)) {
                state.unsupported = true;
                Logger.warn(
                    "[Search] 当前 LanceDB 不支持 renameTable，后续全量替换将直接走重建路径。",
                    error,
                );
            } else {
                Logger.warn(
                    `[Search] 表 [${this.name}] staging 交换失败，回退重建:`,
                    error,
                );
            }

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

        Logger.debug(
            `[Search] 表 [${this.name}] 检索开始: query=${JSON.stringify(
                queryText,
            )}, limit=${limit}, rerankEnabled=${rerankEnabled}, ` +
            `rerankStatus=${rerank.status}, candidateLimit=${candidateLimit}`,
        );

        const query = await this.buildQuery(queryText, {
            ...opts,
            limit: candidateLimit,
        });
        const rows = (await query.toArray()) as T[];

        Logger.debug(
            `[Search] 表 [${this.name}] 检索候选完成: rows=${rows.length}`,
        );

        // 未启用 Rerank：没有可靠的跨查询相关度信号。
        // 按候选数截断，不做"明显不相关"判断（_distance 不可比，不上浮）。
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

            // topN 取 candidateLimit 而非 limit：
            // 断崖检测需要看到足够多的候选分布，才能正确找到边界。
            const result = await rerank.rerank(queryText, documents, {
                topN: candidateLimit,
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

            // Rerank 参与时：用断崖检测决定自然边界，
            // 截掉"明显不同"的低分尾部，而不是机械 slice(0, limit)。
            return truncateByScoreGap(ranked, limit);
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
        } = opts;

        const q = (queryText ?? "").trim();
        if (!q) {
            throwPrecondition("[Search] queryText 不能为空。");
        }

        const table = this.ensureTable();

        let canUseVector = this.host.embedReady && !this.host.rebuilding;
        let vecSize: number | null = null;
        if (canUseVector) {
            vecSize = await this.resolveVectorSize();
            canUseVector = vecSize === this.host.embedSize;
        }

        const effectiveMode =
            mode !== "fts" && !canUseVector ? "fts" : mode;

        // 容错：调用方请求了向量/混合检索，但表维度与 embedSize 不一致。
        // 这是语义检索静默退化为全文检索最典型的成因（首次无 embed 时建的
        // 1 维表、appliedState 与实际 schema 漂移等）。只降级不修复会导致
        // 「一错永错」，因此这里主动排队后台重建；本次检索仍走 FTS 返回。
        //
        // 显式 mode="fts" 时不动：那是调用方主动选择全文检索，与健康度无关。
        if (mode !== "fts" && !canUseVector && this.host.embedReady) {
            this.requestAlign(
                `vecSize=${vecSize ?? "n/a"} vs embedSize=${this.host.embedSize}`,
            );
        }

        Logger.debug(
            `[Search] 表 [${this.name}] 模式解析: requested=${mode}, effective=${effectiveMode}, ` +
            `embedReady=${this.host.embedReady}, rebuilding=${this.host.rebuilding}, ` +
            `vecSize=${vecSize ?? "n/a"}, ` +
            `embedSize=${this.host.embedReady ? this.host.embedSize : "n/a"}`,
        );

        const ftsColumns = ftsColumn ? [ftsColumn] : this.ftsColumns();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = table.query();

        // 注意：不要在这里用 LanceDB SQL 函数判断零向量。
        // 当前运行时不支持 array_sum，拼进 where 会导致所有向量/混合检索
        // 直接失败（Invalid function 'array_sum'）。
        // 零向量占位行相似度低，通常排在候选末尾；稳定性优先，
        // 这里只使用调用方显式传入的 filter。
        const combinedFilter = filter?.trim() ? filter : "";

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
// Rerank 分数与断崖截断
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

/**
 * 断崖检测：按 rerankScore 降序，找到第一个"相邻落差显著大于整体落差"的位置，
 * 在该处截断。不依赖跨查询不可比的绝对阈值。
 *
 * - 仅在 Rerank 参与时调用（所有行都有 rerankScore）；
 * - n <= 3 不做统计，直接按 limit 切片；
 * - 若任一缺失 rerankScore，说明上游非预期，回退到按 limit 切片；
 * - 至少保留 GAP_MIN_TOP_K 条，避免断崖过早导致空结果；
 * - 最多 maxTopK = min(limit, n) 条，不突破调用方上限。
 */
function truncateByScoreGap<T extends Record<string, unknown>>(
    rows: T[],
    limit: number,
): T[] {
    const fallback = rows.slice(0, limit);
    if (rows.length <= 3) return fallback;

    const indexed: Array<{ row: T; score: number }> = [];
    for (const row of rows) {
        const s = row["rerankScore"];
        if (typeof s !== "number" || !Number.isFinite(s)) {
            return fallback;
        }
        indexed.push({ row, score: s });
    }
    if (indexed.length <= 3) return fallback;

    indexed.sort((a, b) => b.score - a.score);

    const minTopK = Math.min(GAP_MIN_TOP_K, indexed.length);
    const maxTopK = Math.min(limit, indexed.length);

    if (maxTopK <= minTopK) {
        return indexed.slice(0, maxTopK).map((x) => x.row);
    }

    const gaps: number[] = [];
    for (let i = 0; i < indexed.length - 1; i++) {
        gaps.push(indexed[i].score - indexed[i + 1].score);
    }
    const meanGap =
        gaps.reduce((s, g) => s + g, 0) / gaps.length;

    let cut = maxTopK;
    // 从 minTopK-1 开始，到 maxTopK-1 前停止：
    // 边界至少要有 minTopK 条在前，最多切到 maxTopK。
    for (let i = minTopK - 1; i < maxTopK - 1; i++) {
        const gap = gaps[i];
        const cur = Math.abs(indexed[i].score) || 1;
        const relative = gap / cur;
        if (gap > GAP_ABS_MULTIPLIER * meanGap && relative > GAP_REL_RATIO) {
            cut = i + 1;
            break;
        }
    }

    return indexed.slice(0, cut).map((x) => x.row);
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

function isRenameTableUnsupportedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /rename_table.*not supported|renameTable.*not supported/i.test(
        message,
    );
}