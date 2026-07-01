import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import type { Provider } from '$types/index.js';
import type { EmbedManyResult, EmbedResult } from 'ai';
import type { EmbedingImpl, EmbedingOptions, EmbedingOp } from './type.js';
import { embed, embedMany } from 'ai'
import { createProvider } from './provider.js';
import { localEmbeding } from './node-llama-cpp/embed.js';
import { AutoPrefixEmbed } from './autoprefix.js';


function getAiEmbeding(embedModel: EmbeddingModelV4): EmbedingImpl {
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
export async function createEmbeding(modelId: string, provider?: Provider): Promise<EmbedingOp> {
    let embedHandle: EmbedingImpl;
    if (provider) {
        const pvInst = createProvider(provider);

        embedHandle = getAiEmbeding(pvInst.embeddingModel(modelId))
    } else {
        // 创建本地embeding. 
        embedHandle = await localEmbeding.init(modelId);
    }

    return new AutoPrefixEmbed(embedHandle, modelId);

}
