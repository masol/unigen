// packages/main/src/libs/searchsrv/tables/kb-registry.ts
// tables/kb-registry.ts
import Logger from "electron-log/main.js";
import { createHash, randomUUID } from "node:crypto";
import pMap from "p-map";
import { throwPrecondition } from "../../utils/err.js";
import { loadTextFile } from "../file-text-loader.js";
import {
    scanKnowledgeBaseDirectories,
    scanKnowledgeBaseDirectory,
    type ScannedKnowledgeBase,
} from "../kb-loader.js";
import { KB_PREFIX } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import type { SearchOptions } from "../types.js";
import { KbCatalogTable, type KbCatalogRow } from "./kb-catalog-table.js";
import { KbTable, type KbDocumentInput } from "./kb-table.js";

/**
 * 文件级并行度：与 skill-loader 保持一致，仅用于文件读取。
 */
const FILE_CONCURRENCY = 8;

/**
 * 知识库注册表：管理多个 KbTable 的生命周期，并提供目录级检索。
 *
 * 渐进式调用流程（推荐）：
 *   1. searchKnowledgeBases(query)   先选库，拿到候选 kbId
 *   2. get(kbId).searchChunks(query) 再进库检索 chunk
 *
 * 已确定目标库时可直接调用 get(kbId)，跳过目录检索。
 *
 * 生命周期与同步路径：
 *   - 加载：restore，由 GlobalSearchDB.onEmbeddingReady 在每次启动时调用；
 *     从 catalog 恢复所有已登记知识库的表到内存 Map。tool/skill 表靠
 *     固定表名 init 即完成加载，KbTable 是动态表，必须有这一步等价入口。
 *   - 单库增量：syncKnowledgeBaseFromDir / removeKnowledgeBase，只处理单个库，
 *     不 readdir 根目录、不触碰其它库。upsert / install / delete 走这里。
 *   - 启动差量：syncKnowledgeBases，由 syncSystemKC 调用；只重建「新增」或
 *     「meta 变化」的库，已存在且未变化的库只加载不重建。
 *   - Embedding 全量：reindexCatalog，仅由 onEmbeddingChanged 调用；
 *     catalog 使用独立 schema，不能走 KbTable 通用重建路径。
 */
export class KbRegistry {
    private readonly tables = new Map<string, KbTable>();
    private catalog: KbCatalogTable | null = null;
    private catalogReady: Promise<void> | null = null;

    constructor(
        private readonly host: SearchDbBase,
        private readonly prefix = KB_PREFIX,
    ) { }

    buildTableName(collection: string): string {
        const normalized = collection.trim().toLowerCase();
        const safe = normalized
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "");

        if (!safe) {
            const hash = createHash("sha1")
                .update(collection)
                .digest("hex")
                .slice(0, 16);
            return `${this.prefix}${hash}`;
        }

        // 目录名作为知识库 id 时可能包含中文等非 ASCII 字符。
        // 纯 ASCII 合法名保持原表名；含非 ASCII 时追加短 hash 防冲突。
        if (/[^a-z0-9_]/.test(normalized)) {
            const hash = createHash("sha1")
                .update(collection)
                .digest("hex")
                .slice(0, 8);
            return `${this.prefix}${safe}_${hash}`;
        }

        return `${this.prefix}${safe}`;
    }

    async ensure(collection: string): Promise<KbTable> {
        const cached = this.tables.get(collection);
        if (cached) return cached;

        const table = new KbTable(this.host, this.buildTableName(collection));
        await table.init();
        this.tables.set(collection, table);

        Logger.debug(
            `[Search] 知识库 [${collection}] -> 表 [${table.name}] 已就绪`,
        );
        return table;
    }

    get(collection: string): KbTable {
        const table = this.tables.get(collection);
        if (!table) {
            throwPrecondition(
                `[Search] 知识库 [${collection}] 未加载，请先调用 ensure。`,
            );
        }
        return table;
    }

    tryGet(collection: string): KbTable | undefined {
        return this.tables.get(collection);
    }

    has(collection: string): boolean {
        return this.tables.has(collection);
    }

    listLoaded(): string[] {
        return Array.from(this.tables.keys());
    }

    entries(): Array<[string, KbTable]> {
        return Array.from(this.tables.entries());
    }

    closeAll(): void {
        for (const table of this.tables.values()) {
            table.close();
        }
        this.tables.clear();

        this.catalog?.close();
        this.catalog = null;
        this.catalogReady = null;
    }

    async drop(collection: string): Promise<void> {
        const tableName = this.buildTableName(collection);
        this.tables.get(collection)?.close();
        this.tables.delete(collection);

        try {
            await this.host.db.dropTable(tableName);
            Logger.debug(`[Search] 已删除知识库表 [${tableName}]`);
        } catch (error) {
            Logger.warn(`[Search] 删除知识库表 [${tableName}] 失败:`, error);
        }
    }

    // ------------------------------------------------------------
    // 知识库目录相关能力
    // ------------------------------------------------------------

    private async ensureCatalog(): Promise<KbCatalogTable> {
        if (this.catalog) return this.catalog;

        if (!this.catalogReady) {
            this.catalogReady = (async () => {
                const table = new KbCatalogTable(this.host);
                await table.init();
                this.catalog = table;
            })();
        }

        await this.catalogReady;
        return this.catalog!;
    }

    /**
     * 从 catalog 恢复所有已登记知识库的表到内存。
     *
     * 每个知识库是一张独立表，表名由 kbId 派生，无法在启动时靠固定
     * 表名 init 打开，必须先从 catalog 拿到 id 列表再逐个 ensure。
     *
     * 这是二次启动的关键路径：search_inited 已为 true 时 syncSystemKC
     * 不会重跑，若不在 embedding 就绪时恢复，KbRegistry.tables 会为空，
     * 检索侧 has(kbId) 为 false 而静默跳过。
     *
     * 只加载 catalog 中已登记的库，不扫描磁盘；磁盘上目录的新增 /
     * 删除由 syncKnowledgeBases（首次启动）和 upsert / install API 处理。
     *
     * 幂等：ensure 命中内存缓存时零成本；表实际不存在时 init 会自动
     * 创建空表（embedReady 时用 embedSize，否则占位维度），后续
     * syncKnowledgeBase 或 upsert 可正常写入。
     */
    async restore(): Promise<void> {
        const catalog = await this.ensureCatalog();
        const entries = await catalog.listEntries();
        if (entries.length === 0) return;

        let loaded = 0;
        for (const entry of entries) {
            try {
                await this.ensure(entry.id);
                loaded++;
            } catch (error) {
                Logger.warn(
                    `[Search] 恢复知识库 [${entry.id}] 失败，已跳过。`,
                    error,
                );
            }
        }

        Logger.debug(
            `[Search] 知识库表恢复完成: 总计=${entries.length}, 加载=${loaded}。`,
        );
    }

    /**
     * 单库增量同步：读取指定知识库目录，重建该库 chunk 表，
     * 并 upsert 该库在目录表中的单条记录。
     *
     * 不 readdir 根目录、不触碰其它知识库、不做 syncCatalog 全量替换。
     * upsert / install 等单库变更必须走这里。
     */
    async syncKnowledgeBaseFromDir(kbDir: string): Promise<void> {
        const kb = await scanKnowledgeBaseDirectory(kbDir);
        if (!kb) {
            throwPrecondition(
                `[Search] 无法加载知识库目录（meta.json 缺失或非法）: ${kbDir}`,
            );
        }

        const catalog = await this.ensureCatalog();
        await catalog.upsertCatalogEntry({
            id: kb.id,
            name: kb.name,
            description: kb.description,
        });

        await this.syncKnowledgeBase(kb);
    }

    /**
     * 单库增量删除：drop 该库 chunk 表，并删除目录表中的单条记录。
     * 不触发任何全量同步，不影响其它知识库。
     */
    async removeKnowledgeBase(kbId: string): Promise<void> {
        await this.drop(kbId);

        const catalog = await this.ensureCatalog();
        await catalog.deleteCatalogEntry(kbId);
    }

    /**
     * 启动期差量同步：只重建「新增」或「meta 变化」的库。
     *
     * 已存在且 name/description 完全一致的库直接跳过内容重建——它们的内容
     * 在磁盘上没变（用户通过 upsert / install 修改后 catalog 已同步，
     * 内容更新在对应接口中已写入 LanceDB），无需再次重建。
     *
     * 但“跳过重建”不等于“跳过加载”。此处对所有扫描到的知识库都 ensure，
     * 保证本方法被任何调用路径触发后，KbRegistry.tables 覆盖全部扫描结果，
     * 检索侧不会因 has(kbId) 为 false 而漏库。启动路径上通常已由
     * restore 加载，这里的 ensure 会命中缓存，零成本。
     *
     * 这是修复"每次启动都全量重建所有 kb 表"的关键路径：
     *   - 仅新增 / 删除 / meta 变化时触发 catalog.syncCatalog
     *   - 仅对新增 / meta 变化的 kb 调用 syncKnowledgeBase（单库重建）
     *   - 其它情况只加载表，不重建内容
     */
    async syncKnowledgeBases(
        scanned: ScannedKnowledgeBase[],
    ): Promise<void> {
        const catalog = await this.ensureCatalog();
        const existing = await catalog.listEntries();
        const existingById = new Map(existing.map((e) => [e.id, e]));
        const scannedIds = new Set(scanned.map((kb) => kb.id));

        // 判断哪些需要重建：新增的、或 meta（name/description）变化的。
        const toRebuild: ScannedKnowledgeBase[] = [];
        for (const kb of scanned) {
            const current = existingById.get(kb.id);
            if (
                !current ||
                current.name !== kb.name ||
                current.description !== kb.description
            ) {
                toRebuild.push(kb);
            }
        }

        // catalog 是否需要整体同步：新增 / 删除 / 元信息变化。
        // 三者都没有时跳过 syncCatalog，避免无谓的 catalog 全量重建。
        const catalogChanged =
            toRebuild.length > 0 ||
            existing.length !== scanned.length ||
            existing.some((e) => !scannedIds.has(e.id));

        if (catalogChanged) {
            await catalog.syncCatalog(
                scanned.map((kb) => ({
                    id: kb.id,
                    name: kb.name,
                    description: kb.description,
                })),
            );
        }

        if (toRebuild.length > 0) {
            Logger.debug(
                `[Search] 知识库启动同步: 总计=${scanned.length}, 需重建=${toRebuild.length}, ` +
                `跳过内容重建=${scanned.length - toRebuild.length}`,
            );
        } else if (catalogChanged) {
            Logger.debug(
                `[Search] 知识库目录已同步（无内容重建需要）: 总计=${scanned.length}`,
            );
        } else {
            Logger.debug(
                `[Search] 知识库启动同步: 内容无变化，仅加载表（总计=${scanned.length}）。`,
            );
        }

        // 差量同步只决定是否重建内容，不决定是否加载表。
        // 对所有扫描到的库 ensure，保证本方法调用后全部可用。
        for (const kb of scanned) {
            await this.ensure(kb.id);
        }

        for (const kb of toRebuild) {
            await this.syncKnowledgeBase(kb);
        }
    }

    /**
     * 单根全量同步。保留供单根初始化使用；
     * 多根场景请先合并扫描结果再调用 syncKnowledgeBases。
     */
    async syncKnowledgeBasesFromDirectory(rootDir: string): Promise<void> {
        const scanned = await scanKnowledgeBaseDirectories(rootDir);
        await this.syncKnowledgeBases(scanned);
    }

    /**
     * 按当前 Embedding 重建目录表。
     *
     * catalog 使用独立 schema（name/description），不能走 KbTable 通用
     * 重建路径，否则 schema 会被 KB chunk schema 覆盖。
     *
     * Embedding 变化时由 GlobalSearchDB.onEmbeddingChanged 单独调用。
     * 这是必要的全量重建：所有向量必须用新模型重算，无法避免。
     */
    async reindexCatalog(): Promise<void> {
        if (!this.host.embedReady) return;

        const catalog = await this.ensureCatalog();
        const rows = await catalog.queryAll();
        if (rows.length === 0) return;

        await catalog.rebuild(rows);

        Logger.debug(
            `[Search] 知识库目录表已按新 Embedding 重建，条目数=${rows.length}。`,
        );
    }

    /**
     * 重建单个已扫描知识库的 chunk 表。
     *
     * 文件读取通过 pMap 并发；建表/换表仍串行，避免在同一个
     * LanceDB Connection 上并发执行 renameTable / dropTable 引发竞争。
     */
    private async syncKnowledgeBase(
        kb: ScannedKnowledgeBase,
    ): Promise<void> {
        const table = await this.ensure(kb.id);

        const docsOrNull = await pMap(
            kb.files,
            async (file): Promise<KbDocumentInput | null> => {
                const text = await loadTextFile(file.path);

                if (!text.trim()) {
                    Logger.warn(
                        `[Search] 知识库 [${kb.id}] 文件为空或读取失败，已忽略: ${file.source}`,
                    );
                    return null;
                }

                return {
                    id: `${kb.id}:${file.source}`,
                    text,
                    title: kb.name,
                    source: file.source,
                    metadata: {
                        kbId: kb.id,
                        file: file.source,
                    },
                };
            },
            { concurrency: FILE_CONCURRENCY },
        );

        const docs = docsOrNull.filter(
            (doc): doc is KbDocumentInput => doc !== null,
        );

        await table.replaceDocuments(docs);

        Logger.debug(
            `[Search] 知识库 [${kb.id}] 已同步，文件数=${docs.length}`,
        );
    }

    /**
     * 新建知识库并写入一篇文档。
     *
     * 完成三件事：
     *   1. 在目录表登记 name/description（供 AI 先搜库）
     *   2. 创建对应的 KbTable
     *   3. 调用 KbTable.addDocument 内部切 chunk
     *
     * @returns 新建知识库的 id；后续检索时作为 collection 使用。
     */
    async createKnowledgeBase(input: {
        /** 知识库名称，参与目录检索。 */
        name: string;
        /** 知识库描述，决定 AI 是否会选中它，应写清适用范围。 */
        description: string;
        /**
         * 要写入的文档。
         * 传原文即可，内部会切分；若已切分请改用 get(id).addChunks。
         * id 缺省时自动生成（与知识库 id 关联）。
         */
        document: Omit<KbDocumentInput, "id"> & { id?: string };
    }): Promise<string> {
        const catalog = await this.ensureCatalog();
        const kbId = randomUUID();
        const docId = input.document.id ?? `${kbId}_doc`;

        await catalog.addCatalogEntry({
            id: kbId,
            name: input.name,
            description: input.description,
        });

        const table = await this.ensure(kbId);
        await table.addDocument({
            id: docId,
            text: input.document.text,
            title: input.document.title ?? input.name,
            source: input.document.source,
            metadata: input.document.metadata,
        });

        Logger.debug(
            `[Search] 知识库 [${input.name}] (${kbId}) 已创建，文档 [${docId}] 已切分写入`,
        );
        return kbId;
    }

    /**
     * 按 name/description 检索知识库目录，返回候选知识库。
     *
     * 这是渐进式检索的第一步：先让 AI 选定库，再对该库调用
     * `get(kbId).searchChunks(query)` 检索具体 chunk。
     *
     * @param queryText 自然语言查询，例如“产品规格参数”。
     * @param opts      透传给底层 search，可指定 limit / mode 等。
     */
    async searchKnowledgeBases(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<KbCatalogRow[]> {
        const catalog = await this.ensureCatalog();
        return catalog.searchCatalog(queryText, opts);
    }

    /** 按 id 获取知识库目录项，不依赖该知识库表是否已加载。 */
    async getCatalogEntry(id: string): Promise<KbCatalogRow | null> {
        const catalog = await this.ensureCatalog();
        return catalog.getById(id);
    }

    /**
     * 全量知识库目录项，按 name/id 稳定排序。
     * 用于 query_all_knowledge 等需要返回稳定名称的场景，不依赖已加载表。
     */
    async listCatalogEntries(): Promise<KbCatalogRow[]> {
        const catalog = await this.ensureCatalog();
        return catalog.listEntries();
    }
}