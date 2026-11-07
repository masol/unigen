import { throwPrecondition } from '$libs/utils/err.js';
import { appLife } from '$libs/utils/tapable/applife.js';
import Logger from 'electron-log/main.js';
import type {
    LlamaModel,
    LlamaRankingContext,
} from 'node-llama-cpp';
import type {
    RerankImpl,
    RerankOptions,
    RerankResultLike,
} from '../type.js';
import { getLlamaInstance } from './llama-service.js';

const DEFAULT_CONTEXT_SIZE = 2048;

class RerankManager implements RerankImpl {
    private model: LlamaModel | null = null;
    private context: LlamaRankingContext | null = null;
    private loadedModelPath: string | null = null;
    private loadedContextSize: number | null = null;
    private unregisterBeforeQuit: (() => void) | null = null;

    constructor() {
        this.unregisterBeforeQuit = appLife.beforeQuit.tapPromise(
            'RerankManager',
            async () => {
                Logger.debug('[RerankManager] 正在清理 rerank 资源...');
                await this.dispose();
                Logger.debug('[RerankManager] rerank 资源清理完成。');
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
                    Logger.info('[RerankManager] ranking 上下文已销毁');
                }
            } catch (err) {
                Logger.error('[RerankManager] 销毁 ranking 上下文出错:', err);
            } finally {
                this.context = null;
            }
        }
        if (this.model) {
            try {
                if (!this.model.disposed) {
                    await this.model.dispose();
                    Logger.info('[RerankManager] rerank 模型已销毁');
                }
            } catch (err) {
                Logger.error('[RerankManager] 销毁 rerank 模型出错:', err);
            } finally {
                this.model = null;
            }
        }
        this.loadedModelPath = null;
        this.loadedContextSize = null;
    }

    async init(modelPath: string, contextSize?: number): Promise<RerankImpl> {
        // 幂等：路径与有效上下文均一致时直接复用，避免无谓地触碰共享 Llama 实例。
        if (this.context && this.model && this.loadedModelPath === modelPath) {
            const modelMax =
                this.model.trainContextSize ?? DEFAULT_CONTEXT_SIZE;
            const desired = Math.min(contextSize ?? modelMax, modelMax);
            if (this.loadedContextSize === desired) {
                Logger.debug('[RerankManager] 复用已加载的模型:', modelPath);
                return this;
            }
        }

        await this.disposeImpl();

        // Llama 实例由 llama-service 全局持有，embedding / rerank 共享同一份。
        const llama = await getLlamaInstance();
        Logger.debug('[RerankManager] 加载 rerank 模型:', modelPath);

        try {
            this.model = await llama.loadModel({ modelPath });
        } catch (err) {
            Logger.error(`[RerankManager] 加载 rerank 模型失败: ${modelPath}`, err);
            await this.disposeImpl();
            throw err;
        }

        const modelMax =
            this.model.trainContextSize ?? DEFAULT_CONTEXT_SIZE;
        const effectiveContextSize = Math.min(
            contextSize ?? modelMax,
            modelMax,
        );

        try {
            this.context = await this.model.createRankingContext({
                contextSize: effectiveContextSize,
            });
            this.loadedModelPath = modelPath;
            this.loadedContextSize = effectiveContextSize;
            Logger.info(
                `[RerankManager] ranking 上下文已创建, contextSize=${effectiveContextSize}`,
            );
            return this;
        } catch (err) {
            Logger.error('[RerankManager] 创建 ranking 上下文失败:', err);
            await this.disposeImpl();
            throw err;
        }
    }

    rerank = async (
        query: string,
        documents: string[],
        opts?: RerankOptions,
    ): Promise<RerankResultLike> => {
        const ctx = this.context;
        if (!ctx) {
            throwPrecondition('本地 rerank 引擎未能正确初始化。');
        }
        if (!documents.length) {
            return { ranking: [], rerankedDocuments: [] };
        }

        // rankAll 返回与 documents 顺序一一对应的分数数组
        const scores = await ctx.rankAll(query, documents);

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
}

const KEY = Symbol.for('unigen.singleton.rerankManager');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rerankManager: RerankManager = ((globalThis as any)[KEY] ??=
    new RerankManager());