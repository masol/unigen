import type { GlobalEmbeddingService } from "./global-embedding-service.js";
import { getGlobalEmbeddingService as getEmbeddingService } from "./global-embedding-service.js";
import type { GlobalRerankService } from "./global-rerank-service.js";
import { getGlobalRerankService as getRerankService } from "./global-rerank-service.js";
import {
    getGlobalSearchDB as getSearchDB,
    GlobalSearchDB,
} from "./global-search-db.js";

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
export type { ToolInput, ToolRow } from "./tables/tool-table.js";

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