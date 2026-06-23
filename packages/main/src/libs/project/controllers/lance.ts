import { connect, type Connection } from '@lancedb/lancedb';
import { metaDirName, type IProjectContext } from '../type.js';
import { join } from 'node:path';
import Logger from 'electron-log/main.js';
import { BaseProjectController } from './base.js';

const lanceName = "lance"
export class LanceDB extends BaseProjectController {
    #db: Connection | null = null;
    constructor(ctx: IProjectContext) {
        super(ctx)
    }

    // 是否成功创建--是否提供了系统级的embed.
    get opened(): boolean {
        return !!this.#db;
    }

    async upcert(): Promise<void> {
        if (this.#db) return;
        const lancePath = join(this.ctx.path, metaDirName, lanceName);

        try {
            this.#db = await connect(lancePath, {
                storageOptions: { timeout: '10s' }
            });
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
};