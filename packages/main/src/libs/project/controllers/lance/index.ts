import { connect, type Table, type Connection } from '@lancedb/lancedb';
import { metaDirName, type IProjectContext } from '../../type.js';
import { join } from 'node:path';
import Logger from 'electron-log/main.js';
import { BaseProjectController } from '../base.js';
import { Schema, Field, Utf8, Int32, Bool, List, FixedSizeList, Float32 } from "apache-arrow";
import { throwNotfound } from '$libs/utils/err.js';
import pMap from 'p-map'
import { lanceName, tNames } from './const.js';


export class LanceDB extends BaseProjectController {
    #db: Connection | null = null;
    readonly tables: Record<string, Table> = {}
    constructor(ctx: IProjectContext) {
        super(ctx)
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

    async upcert(): Promise<void> {
        if (this.#db) return;
        const lancePath = join(this.ctx.path, metaDirName, lanceName);

        try {
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

    private getSchema(tableName: string, vecSize: number): Schema {
        if (tableName === tNames.facts) {
            return new Schema([
                new Field("id", new Utf8(), false),                                    // 主键标签
                new Field("vector", new FixedSizeList(vecSize, new Field("item", new Float32(), false)), false), // vecSize维向量
                new Field("core_text", new Utf8(), false),                             // 核心文本
                new Field("fact_type", new Utf8(), false),                             // 抽象类型
                new Field("revealed_to_audience", new Bool(), false),                  // 是否对观众揭露
                new Field("knowers", new List(new Field("item", new Utf8())), false),  // 知情者数组
                new Field("blind_spots", new List(new Field("item", new Utf8())), false),// 盲区角色数组
                new Field("instigators", new List(new Field("item", new Utf8())), false),// 发起者数组
                new Field("target_opponents", new List(new Field("item", new Utf8())), false), // 对手数组
                new Field("conflict_drive", new Utf8(), false),                        // 冲突动机
                new Field("life_cycle_status", new Utf8(), false),                     // 状态机标签
                new Field("scene_number", new Int32(), false),                         // 场次
                new Field("location", new Utf8(), false),                              // 地点
                new Field("timeline_timestamp", new Int32(), false),                  // 时间戳
                new Field("involved_entities", new List(new Field("item", new Utf8())), false) // 涉及实体数组
            ]);
        }
        throwNotfound(`请求表${tableName}的结构定义，但是未发现。`)
    }

    private async loadTable(tName: string) {
        const schema = this.getSchema(tName, 1053);
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