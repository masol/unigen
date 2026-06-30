import { configService } from "$libs/store/index.js";
import { throwPrecondition, throwUnprcessable, throwNotfound } from "$libs/utils/err.js";
import { createEmbeding } from "$libs/utils/model/factory/embed.js";
import Logger from "electron-log";
import { cluster, isNumber } from "radashi";
import type { PrjDB } from "../drizzle/index.js";
import type { Provider } from '$types/index.js';
import pMap from 'p-map'
import type { EmbedingOp, EmbedType } from "$libs/utils/model/factory/type.js";
import { ProjectDbKeys } from "$libs/project/dbkeys.js";

export class LanceEmbeding {
    #embeddingSize: number = -1;
    #embed: EmbedingOp | null = null;
    #embedFrom: string = ""; // 指示当前表中，使用哪个嵌入模型。如果为空，则使用当前模型嵌入，否则在检索之前，需要执行重嵌入任务。

    get embedFrom(): string {
        return this.#embedFrom;
    }

    get embedSize(): number {
        if (!isNumber(this.#embeddingSize || this.#embeddingSize <= 0)) {
            throwPrecondition("[LanceDB] 未配置向量支持。")
        }
        return this.#embeddingSize;
    }

    get embed(): EmbedingOp {
        if (!this.#embed) {
            throwNotfound(`lance无法获取向量服务`)
        }
        return this.#embed;
    }

    async init(prjdb: PrjDB): Promise<void> {
        const curVecModelName = configService().get("embed_model");
        if (!curVecModelName) {
            const msg = "[LanceDB] 未设置向量模型，这将禁用RAG及知识消歧，降低任务准确度。";
            Logger.warn(msg)
            throwPrecondition(msg);
        }

        const embedingFrom = prjdb.get<string>(ProjectDbKeys.embedingFrom);
        const vecModelName = embedingFrom ? "" : prjdb.get<string>(ProjectDbKeys.embedingModelName)
        const embdingSize = embedingFrom ? -1 : prjdb.get<number>(ProjectDbKeys.embedingSize)
        if (vecModelName && vecModelName !== curVecModelName) {
            prjdb.set("embeding_from", vecModelName); // 指示从一个嵌入模型切换到当前模型。后续使用之前，需要检查embeding_from，并执行模型切换动作。
        }

        const finalEmbedModelName = vecModelName || curVecModelName;

        const providers = configService().get('models');
        let providerCfg: Provider | undefined;
        let modelId: string | undefined;
        // vecModelName
        if (finalEmbedModelName?.startsWith("::")) {
            const embedModelInfo = finalEmbedModelName.split("::");
            modelId = embedModelInfo.at(-1);
            const pdId = embedModelInfo.at(-2);
            providerCfg = providers.find((p) => p.id === pdId);
            if (!providerCfg || !modelId) {
                throwPrecondition(`未设置/已删除对应的向量嵌入的提供商:${finalEmbedModelName}`)
            }

            this.#embed = await createEmbeding(modelId, providerCfg);
        } else {
            this.#embed = await createEmbeding(finalEmbedModelName);
        }


        if (!isNumber(embdingSize) || embdingSize <= 0) {
            // embdingSize尚未初始化，需要计算当前向量模型的尺寸。
            const vecInfo = await this.#embed.embed("x", "document");
            this.#embeddingSize = vecInfo.embedding.length
            // console.log("this.#embeddingSize=", this.#embeddingSize);
            prjdb.set("vecModelName", finalEmbedModelName);
            prjdb.set("embdingSize", this.#embeddingSize);
        } else {
            this.#embeddingSize = embdingSize;
        }
        Logger.debug(`[LanceDB] 使用${finalEmbedModelName}嵌入向量，维度为${this.#embeddingSize}`)
    }


    async doEmbedding(batch: string[], type: EmbedType): Promise<number[][]> {
        // 你的模型生成向量逻辑，返回 Array<Array<number>>
        // 1. 使用 radashi 的 cluster 将数组切分为最多 9 个一组的二维数组--千问
        const chunks = cluster(batch, 9); // e.g. [['a', 'b', ...], ['x', 'y']]


        const nestedResults = await pMap(
            chunks,
            async (chunk) => {
                // 调用你的本地/远程模型接口
                const result = await this.#embed?.embedMany(chunk, type);
                if (!result?.embeddings) {
                    throwUnprcessable("[LanceDB] Embedding 批处理失败.")
                }
                return result?.embeddings;
            },
            { concurrency: 6 }
        );
        // 3. nestedResults 是一个三维数组 [[[...], [...]], [[...]]]
        // 使用原生的 .flat() 将其展平为 LanceDB 需要的二维数组 (Array<Array<number>>)
        return nestedResults.flat();
    }
}