import type { GlobalEmbeddingService } from "./global-embedding-service.js";
import { getGlobalEmbeddingService as getEmbeddingService } from "./global-embedding-service.js";
import {
    getGlobalSearchDB as getSearchDB,
    GlobalSearchDB,
} from "./global-search-db.js";

export { GlobalEmbeddingService } from "./global-embedding-service.js";
export { GlobalSearchDB } from "./global-search-db.js";
export { SearchDbBase } from "./search-db-base.js";
export { SearchTableBase } from "./search-table-base.js";
export { KbRegistry } from "./tables/kb-registry.js";
export { KbTable } from "./tables/kb-table.js";
export { SkillTable } from "./tables/skill-table.js";
export { ToolTable } from "./tables/tool-table.js";

export type {
    SearchMode,
    SearchOptions,
    SearchRow
} from "./types.js";

export type {
    EmbeddingFailure, EmbeddingState, EmbeddingStatus, EmbedSwitchPayload
} from "./embedding/embedding-manager.js";

export function getGlobalSearchDB(): GlobalSearchDB {
    return getSearchDB();
}

export function getGlobalEmbeddingService(): GlobalEmbeddingService {
    return getEmbeddingService();
}

export async function openGlobalSearch(): Promise<GlobalSearchDB> {
    getGlobalEmbeddingService() // 懒加载，防止未初始化，从而未挂载事件回调。
    const db = getSearchDB();
    await db.open();
    return db;
}