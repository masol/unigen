import { configService } from '$libs/store/index.js';
import { throwPrecondition } from '$libs/utils/err.js';
import { appLife } from '$libs/utils/tapable/applife.js';
import type { EmbedManyResult, EmbedResult } from 'ai';
import Logger from 'electron-log/main.js';
import type { LlamaEmbeddingContext, LlamaModel } from 'node-llama-cpp';
import pMap from 'p-map';
import type { EmbedingImpl, EmbedingOptions } from '../type.js';
import { getLlamaInstance } from './llama-service.js';

const DEFAULT_CONTEXT_SIZE = 2048;

class LocalEmbeding implements EmbedingImpl {
    embeddingModel: LlamaModel | null = null;
    embeddingContext: LlamaEmbeddingContext | null = null;
    private loadedModelPath: string | null = null;
    private loadedContextSize: number | null = null;
    private unregisterBeforeQuit: (() => void) | null = null;

    /**
     * 幂等注册退出清理钩子。
     * 放在 init() 入口而非 constructor，确保：
     *  - 真正用到本地 embedding 时才注册钩子（懒加载语义）；
     *  - 手动 dispose() 后再次 init() 能重新注册。
     */
    private ensureBeforeQuitHook(): void {
        if (this.unregisterBeforeQuit) return;
        this.unregisterBeforeQuit = appLife.beforeQuit.tapPromise(
            'LocalEmbeding',
            async () => {
                Logger.debug('[LocalEmbeding] 正在清理资源...');
                await this.dispose();
                Logger.debug('[LocalEmbeding] 清理资源完成。');
            },
        );
    }

    async dispose(): Promise<void> {
        this.unregisterBeforeQuit?.();
        this.unregisterBeforeQuit = null;
        await this.disposeImpl();
    }

    private async disposeImpl(): Promise<void> {
        if (this.embeddingContext) {
            try {
                if (!this.embeddingContext.disposed) {
                    await this.embeddingContext.dispose();
                    Logger.info('本地嵌入上下文已成功从显存/内存中销毁');
                }
            } catch (error) {
                Logger.error('销毁本地模型的上下文时出错:', error);
            } finally {
                this.embeddingContext = null;
            }
        }
        if (this.embeddingModel) {
            try {
                if (!this.embeddingModel.disposed) {
                    await this.embeddingModel.dispose();
                    Logger.info('本地模型及关联上下文已成功从显存/内存中销毁');
                }
            } catch (error) {
                Logger.error('销毁本地模型时出错:', error);
            } finally {
                this.embeddingModel = null;
            }
        }
        this.loadedModelPath = null;
        this.loadedContextSize = null;
    }

    embed = async (
        value: string,
        _opts?: EmbedingOptions,
    ): Promise<EmbedResult> => {
        const ctx = this.embeddingContext;
        if (!ctx) {
            throwPrecondition('本地嵌入引擎未能正确初始化。');
        }
        if (!value) {
            // 空字符串短路，避免向模型提交空输入
            return { value, embedding: [], usage: { tokens: 0 }, warnings: [] };
        }
        const embedding = await ctx.getEmbeddingFor(value);
        return {
            value,
            embedding: [...embedding.vector],
            usage: { tokens: 0 },
            warnings: [],
        };
    };

    embedMany = async (
        values: string[],
        _opts?: EmbedingOptions,
    ): Promise<EmbedManyResult> => {
        const ctx = this.embeddingContext;
        if (!ctx) {
            throwPrecondition('本地嵌入引擎未能正确初始化。');
        }
        if (!values.length) {
            return {
                values: [],
                embeddings: [],
                usage: { tokens: 0 },
                warnings: [],
            };
        }
        const concurrency = configService().get('concurrency') ?? 4;
        const embeddingObjects = await pMap(
            values,
            (text) => ctx.getEmbeddingFor(text),
            { concurrency },
        );
        return {
            values,
            embeddings: embeddingObjects.map((item) => [...item.vector]),
            usage: { tokens: 0 },
            warnings: [],
        };
    };

    async init(modelPath: string, contextSize?: number): Promise<EmbedingImpl> {
        // 首次真正使用本地能力时注册退出钩子。
        this.ensureBeforeQuitHook();

        // 幂等：路径与有效上下文均一致时直接复用。
        if (
            this.embeddingContext &&
            this.embeddingModel &&
            this.loadedModelPath === modelPath
        ) {
            const modelMax =
                this.embeddingModel.trainContextSize ?? DEFAULT_CONTEXT_SIZE;
            const desired = Math.min(contextSize ?? modelMax, modelMax);
            if (this.loadedContextSize === desired) {
                Logger.debug('[LocalEmbeding] 复用已加载的模型:', modelPath);
                return this;
            }
        }

        await this.disposeImpl();

        // Llama 实例由 llama-service 全局持有，embedding / rerank 共享同一份。
        const llama = await getLlamaInstance();
        Logger.debug('[LocalEmbeding] 加载模型:', modelPath);

        try {
            this.embeddingModel = await llama.loadModel({ modelPath });
        } catch (error) {
            Logger.error(`加载嵌入模型失败: ${modelPath}`, error);
            await this.disposeImpl();
            throw error;
        }

        const modelMax =
            this.embeddingModel.trainContextSize ?? DEFAULT_CONTEXT_SIZE;
        const effectiveContextSize = Math.min(
            contextSize ?? modelMax,
            modelMax,
        );

        try {
            this.embeddingContext = await this.embeddingModel.createEmbeddingContext(
                {
                    contextSize: effectiveContextSize,
                },
            );
            this.loadedModelPath = modelPath;
            this.loadedContextSize = effectiveContextSize;
            Logger.info(`嵌入上下文已创建, contextSize=${effectiveContextSize}`);
            return this;
        } catch (error) {
            Logger.error('创建嵌入上下文失败:', error);
            await this.disposeImpl();
            throw error;
        }
    }
}

const KEY = Symbol.for('unigen.singleton.localEmbeding');

/**
 * 懒加载单例：首次调用时创建实例。
 * 使用 Symbol.for + globalThis 保证多份编译产物共享同一实例。
 * 退出清理钩子在 init() 中注册，因此仅在实际使用本地 embedding 后生效。
 */
export function getLocalEmbeding(): LocalEmbeding {
    const g = globalThis as Record<symbol, LocalEmbeding | undefined>;
    if (!g[KEY]) {
        g[KEY] = new LocalEmbeding();
    }
    return g[KEY]!;
}