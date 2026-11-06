import { configService } from '$libs/store/index.js';
import { throwPrecondition } from '$libs/utils/err.js';
import { appLife } from '$libs/utils/tapable/applife.js';
import { EmbedManyResult, EmbedResult } from 'ai';
import Logger from 'electron-log/main.js';
import type { Llama, LlamaEmbeddingContext, LlamaModel } from 'node-llama-cpp';
import { getLlama } from 'node-llama-cpp';
import pMap from 'p-map';
import { EmbedingImpl, EmbedingOptions } from '../type.js';

// 建议将模型对应的上下文大小作为配置项管理，或根据模型文件名推断
const DEFAULT_CONTEXT_SIZE = 2048; // 调整为你的嵌入模型训练长度

class LocalEmbeding {
    embeddingModel: LlamaModel | null = null;
    llamaInstance: Llama | null = null;
    embeddingContext: LlamaEmbeddingContext | null = null;
    private unregisterBeforeQuit: (() => void) | null = null;

    constructor() {
        this.unregisterBeforeQuit = appLife.beforeQuit.tapPromise('LocalEmbeding', async () => {
            Logger.debug('[LocalEmbeding] 正在清理资源...');
            await this.dispose(); // dispose 需要是 async
            Logger.debug('[LocalEmbeding] 清理资源完成。');
        });
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
        // llamaInstance 的清理取决于库的设计，通常 loadModel 的模型释放后，
        // llamaInstance 可能仍可复用。如需彻底释放，可考虑在此也调用 dispose。
    }

    private async embed(value: string, _opts?: EmbedingOptions): Promise<EmbedResult> {
        if (!this.embeddingContext) {
            throwPrecondition("本地嵌入引擎未能正确初始化。");
        }
        const embedding = await this.embeddingContext.getEmbeddingFor(value);
        return {
            value,
            embedding: [...embedding.vector],
            usage: { tokens: 0 },
            warnings: []
        };
    }

    private async embedMany(values: string[], _opts?: EmbedingOptions): Promise<EmbedManyResult> {
        if (!this.embeddingContext) {
            throwPrecondition("本地嵌入引擎未能正确初始化。");
        }
        // 使用 pMap 控制并发，但 getEmbeddingFor 本身可能已由库内部批处理优化。
        // 如果库的批处理效率更高，可以直接用 Promise.all，让库来调度。
        const concurrency = configService().get("concurrency") ?? 4;
        const embeddingObjects = await pMap(
            values,
            async (text) => this.embeddingContext!.getEmbeddingFor(text),
            { concurrency }
        );
        return {
            values,
            embeddings: embeddingObjects.map(item => [...item.vector]),
            usage: { tokens: 0 },
            warnings: []
        };
    }

    async init(modelPath: string, contextSize?: number): Promise<EmbedingImpl> {
        await this.disposeImpl();

        if (!this.llamaInstance) {
            this.llamaInstance = await getLlama();
        }
        Logger.debug("load model=", modelPath);
        try {
            this.embeddingModel = await this.llamaInstance.loadModel({ modelPath });
        } catch (error) {
            Logger.error(`加载嵌入模型失败: ${modelPath}`, error);
            throw error; // 让调用方感知失败，便于降级处理
        }

        // 关键修正：使用明确的 contextSize，而不是 'auto'
        const effectiveContextSize = contextSize ?? DEFAULT_CONTEXT_SIZE;
        this.embeddingContext = await this.embeddingModel.createEmbeddingContext({
            contextSize: effectiveContextSize,
            // 可选：batchSize 通常设置得较大以提升吞吐，但需与 contextSize 匹配
            // batchSize: effectiveContextSize, 
        });

        Logger.info(`嵌入上下文已创建, contextSize=${effectiveContextSize}`);

        return {
            embed: this.embed.bind(this),
            embedMany: this.embedMany.bind(this)
        };
    }
}

export const localEmbeding = new LocalEmbeding();