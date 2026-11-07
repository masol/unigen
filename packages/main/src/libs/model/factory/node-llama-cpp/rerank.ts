import { configService } from '$libs/store/index.js';
import { throwPrecondition } from '$libs/utils/err.js';
import { appLife } from '$libs/utils/tapable/applife.js';
import Logger from 'electron-log/main.js';
import type { LlamaModel, LlamaRankingContext } from 'node-llama-cpp';
import pMap from 'p-map';
import type {
    RerankImpl,
    RerankOptions,
    RerankResultLike,
} from '../type.js';
import { getLlamaInstance } from './llama-service.js';

const DEFAULT_CONTEXT_SIZE = 2048;

class LocalRerank implements RerankImpl {
    model: LlamaModel | null = null;
    context: LlamaRankingContext | null = null;
    private loadedModelPath: string | null = null;
    private unregisterBeforeQuit: (() => void) | null = null;

    constructor() {
        this.unregisterBeforeQuit = appLife.beforeQuit.tapPromise(
            'LocalRerank',
            async () => {
                Logger.debug('[LocalRerank] 正在清理资源...');
                await this.dispose();
                Logger.debug('[LocalRerank] 清理资源完成。');
            },
        );
    }

    async dispose(): Promise<void> {
        this.unregisterBeforeQuit?.();
        this.unregisterBeforeQuit = null;
        await this.disposeImpl();
    }

    private async disposeImpl(): Promise<void> {
        if (this.context) {
            try {
                if (!this.context.disposed) {
                    await this.context.dispose();
                    Logger.info('[LocalRerank] 重排上下文已销毁');
                }
            } catch (error) {
                Logger.error('[LocalRerank] 销毁重排上下文出错:', error);
            } finally {
                this.context = null;
            }
        }
        if (this.model) {
            try {
                if (!this.model.disposed) {
                    await this.model.dispose();
                    Logger.info('[LocalRerank] 重排模型已销毁');
                }
            } catch (error) {
                Logger.error('[LocalRerank] 销毁重排模型出错:', error);
            } finally {
                this.model = null;
            }
        }
        this.loadedModelPath = null;
    }

    rerank = async (
        query: string,
        documents: string[],
        opts?: RerankOptions,
    ): Promise<RerankResultLike> => {
        const ctx = this.context;
        if (!ctx) {
            throwPrecondition('本地重排引擎未能正确初始化。');
        }
        if (!documents.length) {
            return { ranking: [], rerankedDocuments: [] };
        }

        // 优先使用 rankAll（内部批处理），退化为逐条 pMap。
        // rankAll 在 v3 的 LlamaRankingContext 上可用。
        let scores: number[];
        if (typeof (ctx as unknown as { rankAll?: unknown }).rankAll === 'function') {
            scores = await ctx.rankAll(query, documents);
        } else {
            const concurrency = configService().get('concurrency') ?? 4;
            scores = await pMap(
                documents,
                (doc) => ctx.rank(query, doc),
                { concurrency },
            );
        }

        let ranking = documents
            .map((document, i) => ({
                originalIndex: i,
                score: scores[i] ?? 0,
                document,
            }))
            .sort((a, b) => b.score - a.score);

        if (typeof opts?.topN === 'number' && opts.topN >= 0) {
            ranking = ranking.slice(0, opts.topN);
        }

        return {
            ranking,
            rerankedDocuments: ranking.map((item) => item.document),
        };
    };

    async init(modelPath: string, contextSize?: number): Promise<RerankImpl> {
        if (this.context && this.loadedModelPath === modelPath) {
            Logger.debug('[LocalRerank] 复用已加载的模型:', modelPath);
            return this;
        }

        await this.disposeImpl();

        const llama = await getLlamaInstance();
        Logger.debug('[LocalRerank] 加载重排模型:', modelPath);

        try {
            this.model = await llama.loadModel({ modelPath });
        } catch (error) {
            Logger.error(`[LocalRerank] 加载重排模型失败: ${modelPath}`, error);
            await this.disposeImpl();
            throw error;
        }

        const modelMax = this.model.trainContextSize ?? DEFAULT_CONTEXT_SIZE;
        const effectiveContextSize = Math.min(contextSize ?? modelMax, modelMax);

        try {
            this.context = await this.model.createRankingContext({
                contextSize: effectiveContextSize,
            });
            this.loadedModelPath = modelPath;
            Logger.info(`[LocalRerank] 重排上下文已创建, contextSize=${effectiveContextSize}`);
            return this;
        } catch (error) {
            Logger.error('[LocalRerank] 创建重排上下文失败:', error);
            await this.disposeImpl();
            throw error;
        }
    }
}

export const localRerank = new LocalRerank();