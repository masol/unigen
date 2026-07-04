import {
    Field,
    FixedSizeBinary,
    FixedSizeList,
    Float32,
    List,
    Schema,
    Utf8,
} from "apache-arrow";
import Logger from "electron-log/main.js";
import { TableBase } from "../tablebase.js";
import type { ILanceDB } from "../type.js";

/** 与业务对齐的行结构 */
export interface SkillRow {
    id: string;          // UUID（外部使用字符串；写入时会被转换为 16 字节）
    name: string;
    text: string;        // 检索文本（会被 embedding）
    tags: string[];      // 硬过滤标签
    vector: number[];    // 向量（autoAdd 时会自动填充）
    skill: string;       // 提示词内容
}

/** Skill 表 Schema */
export function getSkillSchema(vecSize: number) {
    return new Schema([
        // UUID
        new Field("id", new FixedSizeBinary(16), false),

        // 向量（对应 text）
        new Field(
            "vector",
            new FixedSizeList(vecSize, new Field("item", new Float32(), false)),
            false,
        ),

        new Field("name", new Utf8(), false),
        new Field("text", new Utf8(), false),
        new Field(
            "tags",
            new List(new Field("item", new Utf8(), false)),
            false,
        ),

        // 提示词内容（可能很长，用 Utf8）
        new Field("skill", new Utf8(), false),

        // 时间戳
        new Field("created_at", new Utf8(), false),
        new Field("updated_at", new Utf8(), false),
    ]);
}

/**
 * 单张 Skill 表（对应一个 category）
 * 表名规则由外部管理器统一维护，避免非法字符
 */
export class TableSkill extends TableBase {
    constructor(lance: ILanceDB, name: string) {
        super(lance, name);
    }

    async loadTable(): Promise<void> {
        const schema = getSkillSchema(this.lancedb.embedSize);

        const table = await this.lancedb.db.createEmptyTable(this.name, schema);

        // id 主键：btree
        await table.createIndex("id", {
            config: this.lancedb.lanceInst.Index.btree(),
            replace: true,
        });

        // text: FTS（供 fts / hybrid 模式）
        try {
            await table.createIndex("text", {
                config: this.lancedb.lanceInst.Index.fts(),
                replace: true,
            });
        } catch (e) {
            Logger.warn(`[LanceDB] 表 [${this.name}] 创建 FTS(text) 索引失败:`, e);
        }

        // tags: 标签过滤索引（可选，加速 array_contains 过滤）
        try {
            await table.createIndex("tags", {
                config: this.lancedb.lanceInst.Index.labelList(),
                replace: true,
            });
        } catch (e) {
            Logger.warn(`[LanceDB] 表 [${this.name}] 创建 labelList(tags) 索引失败:`, e);
        }

        this.table = table;
    }
}
