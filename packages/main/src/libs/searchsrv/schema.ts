import {
    Field,
    FixedSizeList,
    Float32,
    Schema,
    Utf8,
} from "apache-arrow";
import Logger from "electron-log/main.js";
import type { LanceRuntime } from "./lance-runtime.js";

export const TOOL_TABLE = "tool";
export const SKILL_TABLE = "skill";
export const KB_PREFIX = "kb_";
export const KB_CATALOG_TABLE = "kb_catalog";

function vectorField(vecSize: number): Field {
    return new Field(
        "vector",
        new FixedSizeList(vecSize, new Field("item", new Float32(), false)),
        false,
    );
}

export function getToolSchema(vecSize: number): Schema {
    return new Schema([
        new Field("id", new Utf8(), false),
        vectorField(vecSize),
        new Field("name", new Utf8(), false),
        new Field("description", new Utf8(), false),
        new Field("text", new Utf8(), false),
        new Field("metadata", new Utf8(), false),
        new Field("created_at", new Utf8(), false),
        new Field("updated_at", new Utf8(), false),
    ]);
}

export function getSkillSchema(vecSize: number): Schema {
    return new Schema([
        new Field("id", new Utf8(), false),
        vectorField(vecSize),
        new Field("name", new Utf8(), false),
        new Field("description", new Utf8(), false),
        new Field("path", new Utf8(), false),
        new Field("text", new Utf8(), false),
        new Field("metadata", new Utf8(), false),
        new Field("created_at", new Utf8(), false),
        new Field("updated_at", new Utf8(), false),
    ]);
}

export function getKbSchema(vecSize: number): Schema {
    return new Schema([
        new Field("id", new Utf8(), false),
        vectorField(vecSize),
        new Field("text", new Utf8(), false),
        new Field("title", new Utf8(), false),
        new Field("source", new Utf8(), false),
        new Field("metadata", new Utf8(), false),
        new Field("created_at", new Utf8(), false),
        new Field("updated_at", new Utf8(), false),
    ]);
}

/** 知识库目录：AI 先搜 name/description 决定读哪个库 */
export function getKbCatalogSchema(vecSize: number): Schema {
    return new Schema([
        new Field("id", new Utf8(), false),
        vectorField(vecSize),
        new Field("name", new Utf8(), false),
        new Field("description", new Utf8(), false),
        new Field("text", new Utf8(), false),
        new Field("created_at", new Utf8(), false),
        new Field("updated_at", new Utf8(), false),
    ]);
}

export type FtsConfig = ReturnType<LanceRuntime["Index"]["fts"]>;

export function createFtsConfig(lance: LanceRuntime): FtsConfig {
    const Index = lance.Index as unknown as {
        fts(opts?: Record<string, unknown>): FtsConfig;
    };

    try {
        return Index.fts({ baseTokenizer: "jieba/default" });
    } catch (error) {
        Logger.warn(
            "[Search] Jieba tokenizer 不可用（语言模型未安装或加载失败），降级为 icu。",
            error,
        );
    }

    try {
        return Index.fts({ baseTokenizer: "icu" });
    } catch (error) {
        Logger.warn(
            "[Search] ICU tokenizer 不可用，降级为 simple。中文全文检索召回将显著下降，请检查 LanceDB 版本或运行时环境。",
            error,
        );
    }

    return Index.fts();
}