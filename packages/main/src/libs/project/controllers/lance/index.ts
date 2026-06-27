import type { Connection } from '@lancedb/lancedb';
import { metaDirName, type IProjectContext } from '../../type.js';
import { join } from 'node:path';
import Logger from 'electron-log/main.js';
import { BaseProjectController } from '../base.js';
import { throwNotfound, throwNotimplement, throwPrecondition, throwUnprcessable } from '$libs/utils/err.js';
import pMap from 'p-map'
import { createEmbeding, type EmbedingInfo } from '$libs/utils/model/factory/embed.js';
import { PrjDB } from '../drizzle.js';
import { configService } from '$libs/store/index.js';
import { cluster, isNumber } from 'radashi'
import { Provider } from '$types/index.js';
import { ILanceDB } from './type.js';
import { getLanceDB, type LanceDBType } from './lancedb.js'
import { TableBase, TableConstructor } from './tablebase.js';
import { initAllTables } from './tables/index.js';

export const lanceDirName = "lance"

// @TODO: 实现项目类型接口，此处需要调用类型接口来创建和维护表格。当前为了简化，全部硬编码在此处。

export class LanceDB extends BaseProjectController implements ILanceDB {
    #db: Connection | null = null;
    #embed: EmbedingInfo | null = null;
    #embeddingSize: number = -1;
    #lanceInst: LanceDBType | null = null;

    private registry = new Map<TableConstructor, TableBase>();

    constructor(ctx: IProjectContext) {
        super(ctx)
    }

    async addTable<T extends TableBase>(token: TableConstructor<T>, name: string): Promise<void> {
        // 2. 自动实例化：利用统一的构造函数契约，在容器内部 new 出来
        const instance = new token(this, name);
        await instance.init(this.db);
        this.registry.set(token, instance);
    }

    getTable<T extends TableBase>(token: TableConstructor<T>): T | null {
        const instance = this.registry.get(token);
        if (!instance) {
            return null;
        }
        // 3. 内部唯一安全的断言，由于 register 和 resolve 泛型 T 严格绑定，此转换 100% 安全
        return instance as T;
    }

    get embedSize(): number {
        if (!isNumber(this.#embeddingSize) || this.#embeddingSize <= 0) {
            throwPrecondition("[LanceDB] lanceDB未启用向量支持。")
        }
        return this.#embeddingSize;
    }

    get lanceInst(): LanceDBType {
        if (!this.#lanceInst) {
            throwPrecondition("LanceDB未初始化!")
        }
        return this.#lanceInst
    }

    async doEmbedding(batch: string[]): Promise<number[][]> {
        // 你的模型生成向量逻辑，返回 Array<Array<number>>
        // 1. 使用 radashi 的 cluster 将数组切分为最多 9 个一组的二维数组--千问
        const chunks = cluster(batch, 9); // e.g. [['a', 'b', ...], ['x', 'y']]


        const nestedResults = await pMap(
            chunks,
            async (chunk) => {
                // 调用你的本地/远程模型接口
                const result = await this.#embed?.embedMany(chunk);
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


    static ensure(ctx: IProjectContext) { return this.coreEnsure(this, ctx); }


    // 是否成功创建--是否提供了系统级的embed.
    get opened(): boolean {
        return !!this.#db;
    }

    get db(): Connection {
        if (!this.#db) {
            throwNotfound(`未初始化的Lance数据库！`)
        }
        return this.#db;
    }

    get embed(): EmbedingInfo {
        if (!this.#embed) {
            throwNotfound(`lance无法获取向量服务`)
        }
        return this.#embed;
    }

    private async initEmbed() {
        const prjdb = PrjDB.ensure(this.ctx);
        const curVecModelName = configService().get("embed_model");
        if (!curVecModelName) {
            const msg = "[LanceDB] 未设置向量模型，这将禁用RAG及知识消歧，降低任务准确度。";
            Logger.warn(msg)
            throwPrecondition(msg);
        }

        const vecModelName = prjdb.get<string>("vecModelName")
        const embdingSize = prjdb.get<number>("embdingSize")
        if (vecModelName && vecModelName !== curVecModelName) {
            throwNotimplement(`尚未支持lanceDB切换向量模型，期望模型:${vecModelName}`)
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
        } else {
            throwNotimplement("尚未实现本地嵌入")
        }

        if (!providerCfg || !modelId) {
            throwPrecondition(`未设置/已删除对应的向量嵌入的提供商:${finalEmbedModelName}`)
        }

        this.#embed = createEmbeding(providerCfg, modelId);
        if (!isNumber(embdingSize) || embdingSize <= 0) {
            // 需要计算当前向量模型的尺寸。
            const vecInfo = await this.embed.embed("x");
            this.#embeddingSize = vecInfo.embedding.length
            // console.log("this.#embeddingSize=", this.#embeddingSize);
            prjdb.set("vecModelName", finalEmbedModelName);
            prjdb.set("embdingSize", this.#embeddingSize);
        } else {
            this.#embeddingSize = embdingSize;
        }
        Logger.debug(`[LanceDB] 使用${finalEmbedModelName}嵌入向量，维度为${this.#embeddingSize}`)
    }

    async upcert(): Promise<void> {
        if (this.#db) return;
        const lancePath = join(this.ctx.path, metaDirName, lanceDirName);

        try {
            this.#lanceInst = await getLanceDB();

            await this.initEmbed();

            this.#db = await this.lanceInst.connect(lancePath, {
                storageOptions: { timeout: '10s' }
            });
            await initAllTables(this, this.ctx);

            Logger.debug(`[LanceDB] 数据库已成功连接.`);
            return;
        } catch (error) {
            Logger.error('[LanceDB] 本地数据库连接失败:', error);
            throw error;
        }
    }


    /**
     * 安全关闭数据库方法
    */
    close() {
        if (!this.#db) {
            Logger.info('[LanceDB] 数据库本就处于关闭状态.');
            return;
        }

        try {
            Logger.debug('[LanceDB] 正在安全释放资源并关闭连接...');

            for (const tableInstance of this.registry.values()) {
                tableInstance.close();
            }
            this.registry.clear();

            // 调用连接实例的关闭方法
            this.#db.close();

            this.#db = null; // 清空引用
            Logger.log('[LanceDB] 数据库连接已安全断开.');
        } catch (error) {
            Logger.error('[LanceDB] 关闭数据库时发生错误:', error);
            // throw error;
        }
    }
};