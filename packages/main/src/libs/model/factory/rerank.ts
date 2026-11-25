import { throwPrecondition } from '$libs/utils/err.js';
import type { Provider } from '$types/index.js';
import type { ProviderV4, RerankingModelV4 } from '@ai-sdk/provider';
import { rerank } from 'ai';
import Logger from 'electron-log/main.js';
import { createProvider } from './provider.js';
import type {
    RerankImpl,
    RerankOp,
    RerankOptions,
    RerankResultLike,
} from './type.js';

type ProviderWithRerank = ProviderV4 & {
    rerankingModel?: (modelId: string) => RerankingModelV4;
};

function getAiRerank(rerankModel: RerankingModelV4): RerankImpl {
    return {
        rerank: async (
            query: string,
            documents: string[],
            opts?: RerankOptions,
        ): Promise<RerankResultLike> => {
            const result = await rerank({
                model: rerankModel,
                query,
                documents,
                topN: opts?.topN,
            });

            // AI SDK v7 的 RerankResult 没有 warnings 字段，
            // 因此这里只取 ranking 和 rerankedDocuments。
            return {
                ranking: result.ranking.map((item) => ({
                    originalIndex: item.originalIndex,
                    score: item.score,
                    document:
                        typeof item.document === 'string'
                            ? item.document
                            : JSON.stringify(item.document),
                })),
                rerankedDocuments: result.rerankedDocuments.map((doc) =>
                    typeof doc === 'string' ? doc : JSON.stringify(doc),
                ),
            };
        },
    };
}

/**
 * 使用外部 Provider 创建 rerank 模型。
 *
 * 保留 provider 可选参数仅用于源码兼容；本地 node-llama-cpp 已移除，
 * 运行时必须传入支持 rerank 的外部 Provider。
 */
export async function createRerank(
    modelId: string,
    provider?: Provider,
): Promise<RerankOp> {
    if (!provider) {
        throwPrecondition(
            '本地 node-llama-cpp 重排已移除；请传入支持 rerank 的外部 Provider。',
        );
    }

    const pvInst = createProvider(provider) as ProviderWithRerank;

    if (typeof pvInst.rerankingModel !== 'function') {
        throwPrecondition(
            `Provider ${provider.id} (${provider.protocol ?? 'unknown'}) 不支持 rerank 能力。`,
        );
    }

    const rerankHandle = getAiRerank(pvInst.rerankingModel(modelId));

    Logger.debug(
        `[createRerank] provider=${provider.id}, model=${modelId}`,
    );

    return rerankHandle;
}