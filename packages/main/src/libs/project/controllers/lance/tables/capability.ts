import {
    Schema,
    Field,
    Utf8,
    List,
    FixedSizeBinary,
    FixedSizeList,
    Float32,
} from "apache-arrow";
import { TableBase } from "../tablebase.js";
import { ILanceDB } from "../type.js";

export function getSchema(vecSize: number) {
    return new Schema([
        // UUID
        new Field("id", new FixedSizeBinary(16), false),

        // 向量（用于检索）
        new Field(
            "vector",
            new FixedSizeList(vecSize, new Field("item", new Float32(), false)),
            false,
        ),

        // Capability

        new Field("role", new Utf8(), false),
        new Field("goal", new Utf8(), false),
        new Field("input", new List(new Field("item", new Utf8(), false)), false),
        new Field("output", new List(new Field("item", new Utf8(), false)), false),
        new Field("process", new List(new Field("item", new Utf8(), false)), false),

        new Field(
            "negative",
            new List(new Field("item", new Utf8(), false)),
            false,
        ),

        new Field(
            "criteria",
            new List(new Field("item", new Utf8(), false)),
            false,
        ),

        // FewShotExample[]
        // 存储 JSON.stringify(fewshot)
        new Field("fewshot", new Utf8(), false),

        // 时间
        new Field("created_at", new Utf8(), false),
        new Field("updated_at", new Utf8(), false),

    ]);
}



export class TableFact extends TableBase {
    constructor(lance: ILanceDB, name: string) {
        super(lance, name)
    }


    async loadTable() {
        const schema = getSchema(this.lancedb.embedSize);
        // 3. 调用 createEmptyTable 创建空表
        const table = (await this.lancedb.db.createEmptyTable(this.name, schema));
        await table.createIndex("id", {
            config: this.lancedb.lanceInst.Index.btree(), // 使用静态方法生成 config 实例
            replace: true          // 可选：如果已存在同名索引则直接覆盖替换        
        });
        this.table = table;
    }

}