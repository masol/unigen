import type { Provider } from '$types/index.js';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import type { EmbedManyResult, EmbedResult } from 'ai';
import { embed, embedMany } from 'ai';
import { AutoPrefixEmbed } from './autoprefix.js';
import { getLocalEmbeding } from './node-llama-cpp/embed.js';
import { createProvider } from './provider.js';
import type { EmbedingImpl, EmbedingOp, EmbedingOptions } from './type.js';


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
        // 本地 embedding：首次调用时懒加载单例，并在 init() 内注册退出清理钩子。
        embedHandle = await getLocalEmbeding().init(modelId);
    }

    return new AutoPrefixEmbed(embedHandle, modelId);

}