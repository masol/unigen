import { throwPrecondition } from '$libs/utils/err.js';
import type { Provider } from '$types/index.js';
import type { ProviderV4, RerankingModelV4 } from '@ai-sdk/provider';
import { rerank } from 'ai';
import Logger from 'electron-log/main.js';
import { rerankManager } from './node-llama-cpp/rerank-manager.js';
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
 * provider 为空 → 本地 node-llama-cpp 单例；
 * provider 存在 → 走 AI SDK 远程 rerank。
 */
export async function createRerank(
    modelId: string,
    provider?: Provider,
): Promise<RerankOp> {
    let rerankHandle: RerankImpl;

    if (provider) {
        const pvInst = createProvider(provider) as ProviderWithRerank;

        if (typeof pvInst.rerankingModel !== 'function') {
            throwPrecondition(
                `Provider ${provider.id} (${provider.protocol ?? 'unknown'}) 不支持 rerank 能力。`,
            );
        }

        rerankHandle = getAiRerank(pvInst.rerankingModel(modelId));
    } else {
        // 本地 rerank：复用全局单例
        rerankHandle = await rerankManager.init(modelId);
    }

    Logger.debug(
        `[createRerank] provider=${provider ? provider.id : '$llama-cpp'
        }, model=${modelId}`,
    );

    return rerankHandle;
}