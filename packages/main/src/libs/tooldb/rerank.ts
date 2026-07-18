import type { Reranker, ToolSearchResult } from "./type.js";

/**
 * 默认 rerank:直通 + 截断。
 *
 * @TODO 接入 rerank 模型(如 bge-reranker / cohere-rerank / 本地 cross-encoder):
 *   1. 以 (query, `${c.name}: ${c.description}`) 成对送入 rerank 模型打分;
 *   2. 按分数降序;
 *   3. 低于阈值的候选直接丢弃(筛选),再截断到 limit。
 * 候选量级为 limit*3 左右,单次 rerank 开销可控。
 */
export const defaultReranker: Reranker = async (
    _query: string,
    candidates: ToolSearchResult[],
    limit: number,
): Promise<ToolSearchResult[]> => {
    return candidates.slice(0, limit);
};