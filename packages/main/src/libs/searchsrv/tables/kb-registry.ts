// tables/kb-registry.ts
import Logger from "electron-log/main.js";
import { createHash, randomUUID } from "node:crypto";
import pMap from "p-map";
import { throwPrecondition } from "../../utils/err.js";
import { loadTextFile } from "../file-text-loader.js";
import { scanKnowledgeBaseDirectories } from "../kb-loader.js";
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
     * 统一初始化入口：扫描根目录一级子目录，存在 meta.json 的目录视为知识库。
     *
     * 每个知识库会：
     *   1. 全量同步目录表 name/desc
     *   2. 读取 meta.files 中所有文本文件
     *   3. 全量重建该知识库的 chunk 表
     *
     * 文件读取通过 pMap 并发；知识库之间的建表/换表仍串行，避免在同一个
     * LanceDB Connection 上并发执行 renameTable / dropTable 引发竞争。
     *
     * 注意：不会自动删除“目录已不存在”的旧 KbTable，仅从目录表移除。
     */
    async syncKnowledgeBasesFromDirectory(rootDir: string): Promise<void> {
        const catalog = await this.ensureCatalog();
        const scanned = await scanKnowledgeBaseDirectories(rootDir);

        await catalog.syncCatalog(
            scanned.map((kb) => ({
                id: kb.id,
                name: kb.name,
                description: kb.description,
            })),
        );

        for (const kb of scanned) {
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