import { embedding, connect, type Table, type Connection, VectorQuery } from '@lancedb/lancedb';
import { metaDirName, type IProjectContext } from '../../type.js';
import { join } from 'node:path';
import Logger from 'electron-log/main.js';
import { BaseProjectController } from '../base.js';
import { throwNotfound, throwNotimplement, throwPrecondition, throwUnprcessable } from '$libs/utils/err.js';
import pMap from 'p-map'
import { lanceName, tNames } from './const.js';
import { createEmbeding, type EmbedingInfo } from '$libs/utils/model/factory/embed.js';
import { PrjDB } from '../drizzle.js';
import { configService } from '$libs/store/index.js';
import { cluster, isNumber } from 'radashi'
import { Provider } from '$types/index.js';
import { createSchema } from './schema.js';


export class LanceDB extends BaseProjectController {
    #db: Connection | null = null;
    #embed: EmbedingInfo | null = null;
    #embeddingSize: number = -1;
    readonly tables: Record<string, Table> = {}
    constructor(ctx: IProjectContext) {
        super(ctx)
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


    /**
    *  托管式添加,please see https://docs.lancedb.com/embedding    (why visit openai anyway?) 
    */
    public async autoAdd(tName: string, items: Array<{ text: string;[key: string]: unknown }>) {
        const table = this.ensureTable(tName);

        // 提取文本
        const texts = items.map(item => item.text);

        // 计算向量
        const vectors = await this.doEmbedding(texts);

        // 组装回包含 vector 的最终数据并写入 LanceDB
        const recordsToInsert = items.map((item, index) => ({
            ...item,
            vector: vectors[index]
        }));

        await table.add(recordsToInsert);
    }

    /**
     * 自动转换并检索: please see https://docs.lancedb.com/embedding    (why visit openai anyway?) 
     */
    public async autoSearch(tName: string, queryText: string): Promise<VectorQuery> {
        const table = this.ensureTable(tName);

        // 自动将单条搜索文本转化为向量（转成数组形式投喂给批量函数）
        const queryVector = await this.doEmbedding([queryText]);

        // 直接进行向量检索
        return table
            .vectorSearch(queryVector[0])
    }

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

    ensureTable(name: string): Table {
        const t = this.tables[name];
        if (!t) {
            throwNotfound(`[LanceDB] 表 ${name} 未加载`);
        }
        return t;
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
        }
    }

    async upcert(): Promise<void> {
        if (this.#db) return;
        const lancePath = join(this.ctx.path, metaDirName, lanceName);

        try {

            console.log("embedding.getRegistry()=", embedding.getRegistry())
            await this.initEmbed();

            this.#db = await connect(lancePath, {
                storageOptions: { timeout: '10s' }
            });
            await this.initTables();

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

            // 调用连接实例的关闭方法
            this.#db.close();

            this.#db = null; // 清空引用
            Logger.log('[LanceDB] 数据库连接已安全断开.');
        } catch (error) {
            Logger.error('[LanceDB] 关闭数据库时发生错误:', error);
            // throw error;
        }
    }

    private async loadTable(tName: string) {
        const schema = createSchema(tName, this.#embeddingSize);
        // 3. 调用 createEmptyTable 创建空表
        this.tables[tName] = (await this.db.createEmptyTable(tName, schema));
    }

    private async initTables() {
        const tables = await this.db.tableNames();

        const tableNames = Object.values(tNames);

        await pMap(
            tableNames,
            async (name) => {
                if (tables.includes(name)) {
                    Logger.debug(`[LanceDB] 表 [${name}] 已存在，跳过创建。`);
                    this.tables[name] = (await this.db.openTable(name));
                } else {
                    await this.loadTable(name)
                }
            },
            { concurrency: 6 }
        )
    }
};