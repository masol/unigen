export type SearchMode = "vector" | "fts" | "hybrid";

export interface SearchOptions {
    mode?: SearchMode;
    limit?: number;
    ftsColumn?: string;
    filter?: string;
    select?: string[];
    /**
     * 禁用本次检索的内置 Rerank。
     *
     * 默认为 false，保持既有行为。设为 true 后不会触发 Rerank 加载，
     * 也不会为 Rerank 扩大候选集；适合先聚合多个搜索结果，再统一调用
     * GlobalRerankService.rerank 的场景。
     */
    disableRerank?: boolean;
    /**
     * hybrid 模式的 RRF 平滑常数，默认 60。
     * 仅在 mode="hybrid" 且可走向量检索时生效。
     */
    rrfK?: number;
    /**
     * 是否在向量检索时排除零向量占位行，默认 true。
     *
     * 禁用/降级期间写入的数据以零向量占位，恢复 Embedding 后若尚未重建，
     * 这些行不应参与 nearestTo。设为 false 可兼容旧行为或特殊场景。
     */
    excludeZeroVectors?: boolean;
}

export type SearchRow = Record<string, unknown> & { text: string };