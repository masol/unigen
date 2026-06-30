import { JSONObject } from "@ai-sdk/provider";
import { EmbedResult, EmbedManyResult } from "ai";

export type EmbedType = 'query' | 'document';

export type EmbedingOptions = {
    providerOptions?: Record<string, JSONObject>,
    maxRetries?: number,
    abortSignal?: AbortSignal,
    headers?: Record<string, string>
}

export interface EmbedingOp {
    embed: (value: string, type: EmbedType, opts?: EmbedingOptions) => Promise<EmbedResult>;
    embedMany: (value: string[], type: EmbedType, opts?: EmbedingOptions) => Promise<EmbedManyResult>;
}

export interface EmbedingImpl {
    embed: (value: string, opts?: EmbedingOptions) => Promise<EmbedResult>;
    embedMany: (value: string[], opts?: EmbedingOptions) => Promise<EmbedManyResult>;
}