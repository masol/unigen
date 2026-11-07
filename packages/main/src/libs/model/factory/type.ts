import { JSONObject } from "@ai-sdk/provider";
import { EmbedManyResult, EmbedResult } from "ai";

export type EmbedType = 'query' | 'document';

export type EmbedingOptions = {
    providerOptions?: Record<string, JSONObject>,
    maxRetries?: number,
    abortSignal?: AbortSignal,
    headers?: Record<string, string>
}

export interface EmbedingOp {
    embed: (value: string, type: EmbedType, opts?: EmbedingOptions) => Promise<EmbedResult>;
    embedMany: (values: string[], type: EmbedType, opts?: EmbedingOptions) => Promise<EmbedManyResult>;
}

export interface EmbedingImpl {
    embed: (value: string, opts?: EmbedingOptions) => Promise<EmbedResult>;
    embedMany: (values: string[], opts?: EmbedingOptions) => Promise<EmbedManyResult>;
}

// ───────────────────────── Rerank 类型（与 Embeding* 平行） ─────────────────────────
export interface RerankOptions {
    topN?: number;
}

export interface RerankRankingItem {
    originalIndex: number;
    score: number;
    document: string;
}

/**
 * AI SDK v7 的 RerankResult 不包含 warnings 字段，
 * 因此这里也不声明 warnings，避免类型冲突。
 * 如需 warnings，请在调用方通过 onEnd 回调获取。
 */
export interface RerankResultLike {
    ranking: RerankRankingItem[];
    rerankedDocuments: string[];
}

export interface RerankImpl {
    rerank: (
        query: string,
        documents: string[],
        opts?: RerankOptions,
    ) => Promise<RerankResultLike>;
}

export type RerankOp = RerankImpl;