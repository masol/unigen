import { throwNotfound } from "$libs/utils/err.js";
import { Schema, Field, Utf8, FixedSizeList, Float32, Bool, List, Int32 } from "apache-arrow";
import { tNames } from "./const.js";


export function createSchema(tableName: string, vecSize: number): Schema {
    if (tableName === tNames.facts) {
        return new Schema([
            new Field("id", new Utf8(), false),                                    // 主键标签
            new Field("vector", new FixedSizeList(vecSize, new Field("item", new Float32(), false)), false), // vecSize维向量
            new Field("text", new Utf8(), false),                                  // 核心文本 -- 自动向量搜索的文本，名称必须是text.
            new Field("fact_type", new Utf8(), false),                             // 抽象类型
            new Field("revealed_to_audience", new Bool(), false),                  // 是否对观众揭露
            new Field("knowers", new List(new Field("item", new Utf8())), false),  // 知情者数组
            new Field("blind_spots", new List(new Field("item", new Utf8())), false),// 盲区角色数组
            new Field("instigators", new List(new Field("item", new Utf8())), false),// 发起者数组
            new Field("target_opponents", new List(new Field("item", new Utf8())), false), // 对手数组
            new Field("conflict_drive", new Utf8(), false),                        // 冲突动机
            new Field("life_cycle_status", new Utf8(), false),                     // 状态机标签
            new Field("scene_number", new Int32(), false),                         // 场次
            new Field("location", new Utf8(), false),                              // 地点
            new Field("timeline_timestamp", new Int32(), false),                  // 时间戳
            new Field("involved_entities", new List(new Field("item", new Utf8())), false) // 涉及实体数组
        ]);
    }
    throwNotfound(`请求表${tableName}的结构定义，但是未发现。`)
}