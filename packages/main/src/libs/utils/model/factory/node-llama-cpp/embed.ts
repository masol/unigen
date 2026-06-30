import Logger from 'electron-log/main.js';
import { getLlama } from 'node-llama-cpp'
import type { Llama, LlamaEmbeddingContext, LlamaModel } from 'node-llama-cpp'
import { EmbedManyResult, EmbedResult } from 'ai';
import { throwPrecondition } from '$libs/utils/err.js';
import pMap from 'p-map';
import { appLife } from '$libs/utils/tapable/applife.js';
import { EmbedingOptions, EmbedingImpl } from '../type.js';

class LocalEmbeding {
    embeddingModel: LlamaModel | null = null;
    llamaInstance: Llama | null = null;
    embeddingContext: LlamaEmbeddingContext | null = null;

    constructor() {
        appLife.hooks.beforeQuit.tapPromise('LocalEmbeding', async () => {
            Logger.debug('[LocalEmbeding] 正在清理资源...');

            await this.dispose();

            console.log('[ProjectManager] 清理资源完成。');
        });
    }

    async dispose() {
        if (this.embeddingContext) {
            try {
                // 检查模型是否已经被销毁（防止重复调用报错）
                if (!this.embeddingContext.disposed) {
                    // 1. 显式销毁模型，底层释放所有 VRAM / RAM 资源
                    await this.embeddingContext.dispose();
                    Logger.info('本地嵌入上下文已成功从显存/内存中销毁');
                }
            } catch (error) {
                Logger.error('销毁本地模型的上下文时出错:', error);
            } finally {
                // 2. 将引用置为 null，允许 JavaScript 垃圾回收机制 (GC) 回收该变量
                this.embeddingContext = null;
            }
        }
        if (this.embeddingModel) {
            try {
                // 检查模型是否已经被销毁（防止重复调用报错）
                if (!this.embeddingModel.disposed) {
                    // 1. 显式销毁模型，底层释放所有 VRAM / RAM 资源
                    await this.embeddingModel.dispose();
                    Logger.info('本地模型及关联上下文已成功从显存/内存中销毁');
                }
            } catch (error) {
                Logger.error('销毁本地模型时出错:', error);
            } finally {
                // 2. 将引用置为 null，允许 JavaScript 垃圾回收机制 (GC) 回收该变量
                this.embeddingModel = null;
            }
        }
    }

    private async embed(value: string, _opts?: EmbedingOptions): Promise<EmbedResult> {
        if (!this.embeddingContext) {
            throwPrecondition("本地嵌入引擎未能正确初始化。")
        }
        const embedding = await this.embeddingContext.getEmbeddingFor(value);
        return {
            value,
            embedding: [...embedding.vector],
            usage: { tokens: 0 },
            warnings: []
        }
    }

    private async embedMany(values: string[], _opts?: EmbedingOptions): Promise<EmbedManyResult> {
        if (!this.embeddingContext) {
            throwPrecondition("本地嵌入引擎未能正确初始化。")
        }

        const embeddingObjects = await pMap(
            values,
            async (text) => this.embeddingContext!.getEmbeddingFor(text),
            { concurrency: 6 }
        )
        return {
            values,
            embeddings: embeddingObjects.map(item => [...item.vector]),
            usage: { tokens: 0 },
            warnings: []
        }
    }

    async init(modelPath: string): Promise<EmbedingImpl> {
        await this.dispose();
        if (!this.llamaInstance) {
            this.llamaInstance = await getLlama();
        }
        Logger.debug("load model=", modelPath)
        this.embeddingModel = await this.llamaInstance.loadModel({ modelPath });

        this.embeddingContext = await this.embeddingModel.createEmbeddingContext({
            contextSize: 'auto', // 手动限制最大上下文 Token 数
            // threads: 4         // 手动指定计算线程数
        });
        return {
            embed: this.embed.bind(this),
            embedMany: this.embedMany.bind(this)
        }
    }
}

export const localEmbeding = new LocalEmbeding();