import type { EmbeddingModelV3, JSONObject } from '@ai-sdk/provider';
import type { Provider } from '$types/index.js';
import type { EmbedManyResult, EmbedResult } from 'ai';
import { embed, embedMany } from 'ai'
import { createProvider } from './provider.js';


export type EmbedingOptions = {
    providerOptions?: Record<string, JSONObject>,
    maxRetries?: number,
    abortSignal?: AbortSignal,
    headers?: Record<string, string>
}

export type EmbedFunc = (value: string, opts?: EmbedingOptions) => Promise<EmbedResult>
export type EmbedManyFunc = (value: string[], opts?: EmbedingOptions) => Promise<EmbedManyResult>

export type EmbedingInfo = {
    embed: EmbedFunc;
    embedMany: EmbedManyFunc;
}

function getAiEmbeding(embedModel: EmbeddingModelV3): Omit<EmbedingInfo, "vecSize"> {
    return {
        embed: async (value: string, opts?: EmbedingOptions): Promise<EmbedResult> => {
            return await embed({
                ...opts,
                model: embedModel,
                value,
            })
        },
        embedMany: async (values: string[], opts?: EmbedingOptions): Promise<EmbedManyResult> => {
            return await embedMany({
                ...opts,
                model: embedModel,
                values,
            })
        }
    }
}

//provider: $llama-cpp： node-llama-cpp: 以$开头的Provider为内建Provider.
export function createEmbeding(provider: Provider, modelId: string): EmbedingInfo {
    const pvInst = createProvider(provider);

    return getAiEmbeding(pvInst.embeddingModel(modelId))
}
