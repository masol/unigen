import { throwPrecondition } from '$libs/utils/err.js';
import type { Provider } from '$types/index.js';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import type { EmbedManyResult, EmbedResult } from 'ai';
import { embed, embedMany } from 'ai';
import { AutoPrefixEmbed } from './autoprefix.js';
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
                values
            })
        }
    }
}


/**
 * 使用外部 Provider 创建嵌入模型。
 *
 * 保留 provider 可选参数仅用于源码兼容；本地 node-llama-cpp 已移除，
 * 运行时必须传入指向外部 llama.cpp 服务的 Provider。
 */
export async function createEmbeding(modelId: string, provider?: Provider): Promise<EmbedingOp> {
    if (!provider) {
        throwPrecondition(
            'node-llama-cpp 嵌入已移除；请传入指向外部 llama.cpp 服务的 Provider。',
        );
    }

    const pvInst = createProvider(provider);
    const embedHandle = getAiEmbeding(pvInst.embeddingModel(modelId));

    return new AutoPrefixEmbed(embedHandle, modelId);
}