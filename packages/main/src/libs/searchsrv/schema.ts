// schema.ts
import { configService } from "$libs/store/index.js";
import type { FtsTokenizer } from "$types/appconfig.js";
import {
    Field,
    FixedSizeList,
    Float32,
    Schema,
    Utf8,
} from "apache-arrow";
import Logger from "electron-log/main.js";
import { isJiebaTokenizerAvailable, type LanceRuntime } from "./lance-runtime.js";

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

export interface FtsTokenizerInfo {
    /** 用户配置中请求的分词策略。 */
    requested: FtsTokenizer;
    /** 实际将要使用的分词策略；若 jieba 模型不可用，会回退为 icu。 */
    effective: FtsTokenizer;
    /** 是否发生了自动回退。 */
    degraded: boolean;
}

function readRequestedFtsTokenizer(): FtsTokenizer {
    const raw = configService().get("fts_tokenizer");

    if (raw === "jieba" || raw === "icu" || raw === "simple") {
        return raw;
    }

    // 兼容旧配置 / schema 未加载时的兜底。
    return "jieba";
}

/**
 * 解析当前 FTS 分词策略。
 *
 * 注意：`isJiebaTokenizerAvailable()` 依赖 `getLanceRuntime()` 的探测结果。
 * 在检索库真正 open 之前调用时可能暂时返回 false；上层应在数据库 open
 * 之后调用本函数，或在任务入口先调用 `refreshJiebaTokenizerAvailability()`。
 */
export function resolveFtsTokenizer(): FtsTokenizerInfo {
    const requested = readRequestedFtsTokenizer();

    if (requested === "jieba" && !isJiebaTokenizerAvailable()) {
        return {
            requested,
            effective: "icu",
            degraded: true,
        };
    }

    return {
        requested,
        effective: requested,
        degraded: false,
    };
}

export function createFtsConfig(lance: LanceRuntime): FtsConfig {
    const Index = lance.Index as unknown as {
        fts(opts?: Record<string, unknown>): FtsConfig;
    };

    const { effective } = resolveFtsTokenizer();

    if (effective === "jieba") {
        try {
            return Index.fts({ baseTokenizer: "jieba/default" });
        } catch (error) {
            Logger.warn(
                "[Search] Jieba tokenizer 加载失败，降级为 icu。",
                error,
            );
        }
    }

    // 用户请求 icu，或 jieba 创建失败后的回退路径。
    if (effective === "jieba" || effective === "icu") {
        try {
            return Index.fts({ baseTokenizer: "icu" });
        } catch (error) {
            Logger.warn(
                "[Search] ICU tokenizer 不可用，降级为 simple。中文全文检索召回将显著下降，请检查 LanceDB 版本或运行时环境。",
                error,
            );
        }
    }

    try {
        return Index.fts({ baseTokenizer: "simple" });
    } catch (error) {
        Logger.warn(
            "[Search] simple tokenizer 配置不可用，使用 LanceDB 默认分词配置。",
            error,
        );
    }

    return Index.fts();
}