import { TableBase } from "$libs/project/controllers/lance/tablebase.js";
import type { ILanceDB } from "$libs/project/controllers/lance/type.js";
import {
    Field,
    FixedSizeList,
    Float32,
    Schema,
    Utf8,
} from "apache-arrow";
import type { ToolSource } from "./type.js";

function getToolSchema(vecSize: number) {
    return new Schema([
        new Field("id", new Utf8(), false),
        new Field(
            "vector",
            new FixedSizeList(vecSize, new Field("item", new Float32(), false)),
            false,
        ),
        new Field("name", new Utf8(), false),
        new Field("description", new Utf8(), false),
        new Field("source", new Utf8(), false),      // builtin | mcp
        new Field("server_id", new Utf8(), false),   // builtin 为 ""
        new Field("hash", new Utf8(), false),        // name+description 的摘要,用于增量同步
        new Field("text", new Utf8(), false),        // 实际被嵌入的文本
        new Field("updated_at", new Utf8(), false),
    ]);
}

/** SQL 字符串字面量转义 */
export function sqlStr(v: string): string {
    return `'${v.replace(/'/g, "''")}'`;
}

export interface ToolRow {
    id: string;
    name: string;
    description: string;
    source: ToolSource;
    server_id: string;
    hash: string;
    text: string;
}

export class ToolTable extends TableBase {
    constructor(lance: ILanceDB, name: string) {
        super(lance, name);
    }

    async loadTable() {
        const schema = getToolSchema(this.lancedb.embedSize);
        const table = await this.lancedb.db.createEmptyTable(this.name, schema);
        await table.createIndex("id", {
            config: this.lancedb.lanceInst.Index.btree(),
            replace: true,
        });
        this.table = table;
    }

    /** 列出某来源现有行的 (id, hash),用于增量 diff */
    async listBrief(source: ToolSource): Promise<Array<{ id: string; hash: string }>> {
        const rows = await this.ensureTable()
            .query()
            .where(`source = ${sqlStr(source)}`)
            .select(["id", "hash"])
            .toArray();
        return rows as Array<{ id: string; hash: string }>;
    }

    async deleteByIds(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const list = ids.map(sqlStr).join(", ");
        await this.ensureTable().delete(`id IN (${list})`);
    }

    async addRows(rows: Array<ToolRow & { vector: number[] }>): Promise<void> {
        if (rows.length === 0) return;
        const now = new Date().toISOString();
        await this.ensureTable().add(rows.map((r) => ({ ...r, updated_at: now })));
    }

    async searchByVector(
        vector: number[],
        limit: number,
        source?: ToolSource,
    ): Promise<Array<{ id: string; _distance: number }>> {
        let q = this.ensureTable().vectorSearch(vector);
        if (source) q = q.where(`source = ${sqlStr(source)}`);
        const rows = await q
            .select(["id", "name", "source", "server_id"])
            .limit(limit)
            .toArray();
        return rows as Array<{ id: string; _distance: number }>;
    }
}