import type { TaskWarning } from "$libs/utils/task-progress.js";
import {
    complete,
    fail,
    report,
} from "$libs/utils/task-progress.js";
import type { GlobalEmbeddingService } from "./global-embedding-service.js";
import { getGlobalEmbeddingService as getEmbeddingService } from "./global-embedding-service.js";
import type { GlobalRerankService } from "./global-rerank-service.js";
import { getGlobalRerankService as getRerankService } from "./global-rerank-service.js";
import {
    getGlobalSearchDB as getSearchDB,
    GlobalSearchDB,
} from "./global-search-db.js";
import {
    getJiebaTokenizerDir,
    refreshJiebaTokenizerAvailability,
} from "./lance-runtime.js";
import { resolveFtsTokenizer } from "./schema.js";

export { GlobalEmbeddingService } from "./global-embedding-service.js";
export { GlobalRerankService } from "./global-rerank-service.js";
export { GlobalSearchDB } from "./global-search-db.js";
export { SearchDbBase } from "./search-db-base.js";
export { SearchTableBase } from "./search-table-base.js";
export { KbRegistry } from "./tables/kb-registry.js";
export { KbTable } from "./tables/kb-table.js";
export { SkillTable } from "./tables/skill-table.js";
export { ToolTable } from "./tables/tool-table.js";

export {
    SKILL_BODY_META_KEY,
    SKILL_DIR_META_KEY,
    ZERO_VECTOR_META_KEY
} from "./metadata-keys.js";

export type {
    SearchMode,
    SearchOptions,
    SearchRow
} from "./types.js";

export type {
    EmbeddingFailure, EmbeddingState, EmbeddingStatus, EmbedSwitchPayload
} from "./embedding/embedding-manager.js";

export type {
    RerankFailure,
    RerankState,
    RerankStatus
} from "./rerank/rerank-manager.js";

export type { KbCatalogRow } from "./tables/kb-catalog-table.js";
export type {
    KbChunkInput,
    KbChunkRow,
    KbDocumentInput
} from "./tables/kb-table.js";
export type { SkillInput, SkillRow } from "./tables/skill-table.js";
export type {
    ToolInput,
    ToolRow,
    ToolScope
} from "./tables/tool-table.js";

export function getGlobalSearchDB(): GlobalSearchDB {
    return getSearchDB();
}

export function getGlobalEmbeddingService(): GlobalEmbeddingService {
    return getEmbeddingService();
}

export function getGlobalRerankService(): GlobalRerankService {
    return getRerankService();
}

export async function openGlobalSearch(): Promise<GlobalSearchDB> {
    getGlobalEmbeddingService() // 懒加载，防止未初始化，从而未挂载事件回调。
    getGlobalRerankService() // 同上：确保挂载 rerank-changed 事件回调。
    const db = getSearchDB();
    await db.open();
    return db;
}

/**
 * 全文检索索引重设任务的稳定 id。
 *
 * 不与 "startup" 等已有任务共用；客户端按该 id 路由进度。
 */
export const FTS_REINDEX_TASK_ID = "search:fts-reindex";

let ftsReindexPromise: Promise<void> | null = null;

/**
 * 按当前 `fts_tokenizer` 配置重建所有受管表的全文检索索引。
 *
 * - 只重建 FTS 索引，不重算向量，不依赖 Embedding；
 * - 并发调用返回同一个 Promise，不会重复广播进度；
 * - 进度通过 task-progress 的 `report` / `complete` / `fail` 汇报。
 */
export function recreateFtsIndexes(): Promise<void> {
    ftsReindexPromise ??= runFtsReindex().finally(() => {
        ftsReindexPromise = null;
    });
    return ftsReindexPromise;
}

async function runFtsReindex(): Promise<void> {
    report(
        FTS_REINDEX_TASK_ID,
        "prepare",
        "正在检查全文检索分词配置…",
        0,
    );

    // 允许运行期间安装 / 更新 Jieba 模型后立即生效。
    await refreshJiebaTokenizerAvailability();

    let db: GlobalSearchDB;
    try {
        db = await openGlobalSearch();
        if (!db.opened) {
            throw new Error("[Search] 检索数据库未打开。");
        }
    } catch (error) {
        fail(
            FTS_REINDEX_TASK_ID,
            "打开检索数据库失败，无法重建全文检索索引。",
            formatError(error),
        );
        throw error;
    }

    const tokenizer = resolveFtsTokenizer();
    const warnings: TaskWarning[] = [];

    if (tokenizer.degraded) {
        warnings.push({
            id: "search.fts-reindex.jieba-unavailable",
            level: "warn",
            code: "fts.jieba.unavailable",
            message:
                `未找到 Jieba 分词模型（${getJiebaTokenizerDir()}），` +
                `本次重建请求使用 ${tokenizer.effective} 分词。`,
            timestamp: Date.now(),
        });
    }

    if (warnings.length > 0) {
        report(
            FTS_REINDEX_TASK_ID,
            "rebuild",
            "正在重建全文检索索引…",
            0,
            warnings,
        );
    }

    let failures: Array<{ table: string; error: unknown }>;
    try {
        failures = await db.recreateFtsIndexes(({ name, index, total }) => {
            const percent =
                total === 0
                    ? 0
                    : Math.round((index / total) * 100);
            report(
                FTS_REINDEX_TASK_ID,
                "rebuild",
                `正在重建全文检索索引：${name}（${index + 1}/${total}）`,
                percent,
            );
        });
    } catch (error) {
        fail(
            FTS_REINDEX_TASK_ID,
            "重建全文检索索引失败。",
            formatError(error),
        );
        throw error;
    }

    if (failures.length > 0) {
        const message = `全文检索索引重建完成，但有 ${failures.length} 张表失败。`;
        const detail = failures
            .map((item) => `${item.table}: ${formatError(item.error)}`)
            .join("\n");

        fail(FTS_REINDEX_TASK_ID, message, detail);
        throw new Error(`${message}\n${detail}`);
    }

    complete(
        FTS_REINDEX_TASK_ID,
        `全文检索索引已重建（请求策略：${tokenizer.effective}）。`,
        warnings,
    );
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}