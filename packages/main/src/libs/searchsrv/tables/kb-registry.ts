import Logger from "electron-log/main.js";
import { throwPrecondition } from "../../utils/err.js";
import { KB_PREFIX } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { KbTable } from "./kb-table.js";

export class KbRegistry {
    private readonly tables = new Map<string, KbTable>();

    constructor(
        private readonly host: SearchDbBase,
        private readonly prefix = KB_PREFIX,
    ) { }

    buildTableName(collection: string): string {
        const safe = collection
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
            .replace(/^_+|_+$/g, "");

        if (!safe) {
            throwPrecondition(
                `[Search] 非法知识库 collection: "${collection}"`,
            );
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
}