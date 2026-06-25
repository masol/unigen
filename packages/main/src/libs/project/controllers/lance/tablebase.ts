import type { Connection, Table, VectorQuery } from "@lancedb/lancedb";
import type { ILanceDB } from "./type.js";
import { throwNotfound } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { UUID } from "node:crypto";


export abstract class TableBase {
    protected table: Table | null = null;
    readonly name: string;
    constructor(protected lancedb: ILanceDB, name: string) {
        this.name = name;
    }

    close() {
        if (this.table) {
            this.table.close();
            this.table = null;
        }
    }

    abstract loadTable(): Promise<void>;

    async init(db: Connection): Promise<void> {
        const tables = await db.tableNames();

        if (tables.includes(this.name)) {
            Logger.debug(`[LanceDB] 表 [${this.name}] 已存在，正在打开...`);
            this.table = await db.openTable(this.name);
            Logger.debug(`[LanceDB] 表 [${this.name}] 打开成功。`);
        } else {
            Logger.debug(`[LanceDB] 表 [${this.name}] 不存在，开始创建...`);
            await this.loadTable()
            Logger.debug(`[LanceDB] 表 [${this.name}] 创建并初始化索引成功。`);
        }
    }

    ensureTable(): Table {
        const t = this.table;
        if (!t) {
            throwNotfound(`[LanceDB] 表未加载`);
        }
        return t;
    }

    // @TODO: kv-store切换使用sqlite. lanceDB退化为retrieval
    async getById(id: UUID) {
        // 去掉 "-"
        const hex = id.replace(/-/g, "");
        const result = await this.ensureTable().query()
            .where(`id = x'${hex}'`)
            .limit(1)
            .toArray();

        return result
    }

    /**
    *  托管式添加,please see https://docs.lancedb.com/embedding    (why visit openai anyway?) 
    */
    public async autoAdd(items: Array<{ text: string;[key: string]: unknown }>): Promise<void> {
        const table = this.ensureTable();

        // 提取文本
        const texts = items.map(item => item.text);

        // 计算向量
        const vectors = await this.lancedb.doEmbedding(texts);

        // 组装回包含 vector 的最终数据并写入 LanceDB
        const recordsToInsert = items.map((item, index) => ({
            ...item,
            vector: vectors[index]
        }));

        await table.add(recordsToInsert);
    }

    /**
     * 自动转换并检索: please see https://docs.lancedb.com/embedding    (why visit openai anyway?) 
     */
    public async autoSearch(queryText: string): Promise<VectorQuery> {
        const table = this.ensureTable();

        // 自动将单条搜索文本转化为向量（转成数组形式投喂给批量函数）
        const queryVector = await this.lancedb.doEmbedding([queryText]);

        // 直接进行向量检索
        return table
            .vectorSearch(queryVector[0])
    }

}

export type TableConstructor<T extends TableBase = TableBase> =
    new (lancedb: ILanceDB, name: string) => T;

