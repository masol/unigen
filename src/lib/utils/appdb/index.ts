import { CfgDB, type ConfigItem } from './cfgdb';
import { mqttInstance } from './mqtt';


class AppDB {
    #db: CfgDB = new CfgDB();
    // #latest: number = 0;
    // #unsub: (() => void) | null = null;

    async init() {
        // 无需自行维护，而是从mqtt中直接发出cfgchanged:XXX事件。
        // @todo: appWindow.onCloseRequested(async (event) => 中清理．(以后改进)
        // this.#unsub = await eventBus.listen<"cfgchanged">("cfgchanged", (change: Change[]) => {
        //     this.applyChange(change);
        // });
        await this.#db.init("sqlite:app.db", false);

        // 获取最近时间的一条记录并存储 ctime
        // const result = await this.#db.handle.select<Array<{ ctime: number }>>(
        //     "SELECT ctime FROM change ORDER BY ctime DESC LIMIT 1"
        // );

        // this.#latest = result.length > 0 ? result[0].ctime : 0;

        // if (result.length > 0) {
        //     //删除1小时以上的记录．
        //     const oneHourAgo = Math.floor(Date.now() / 1000) - (60 * 60);
        //     await this.#db.handle.execute(
        //         "DELETE FROM change WHERE ctime < ?",
        //         [oneHourAgo]
        //     );
        // }
    }

    // 1. 根据 key 进行 upsert（不存在则新建，存在且唯一则更新，存在多个则不操作）
    // @todo: 需要使用锁，否则并发访问数据库，此种分离处理可能会出错！
    async upsertByKey(key: string, value: string, bNotify: boolean = true): Promise<{ success: boolean, id: string | null }> {
        const result = await this.#db.upsertByKey(key, value);
        if (bNotify && result.success) {
            await this.recordConfigChange(key, result.id);
        }
        return result;
    }

    async upsertById(id: string, key: string, value: string, bNotify = true): Promise<{ success: boolean, id: string }> {
        const result = await this.#db.upsertById(id, key, value);
        if (bNotify && result.success) {
            await this.recordConfigChange(key, result.id);
        }
        return result;
    }

    // 2. 插入新记录
    async insert(key: string, value: string, bNotify = true): Promise<{ success: boolean, id: string | null }> {
        const result = await this.#db.insert(key, value);
        if (bNotify && result.success) {
            await this.recordConfigChange(key, result.id);
        }
        return result;
    }


    // 3. 根据 id 删除记录
    async remove(id: string, key: string, bNotify = true): Promise<{ success: boolean }> {
        const result = await this.#db.remove(id);
        if (bNotify && result.success) {
            await this.recordConfigChange(key, id);
        }
        return result;
    }

    async getConfigsByKey(key: string): Promise<ConfigItem[]> {
        return this.#db.getConfigsByKey(key)
    }

    async getConfigById(id: string): Promise<ConfigItem | null> {
        return this.#db.getConfigById(id);
    }

    // 记录配置变更
    private async recordConfigChange(key: string, cfgid: string | null = null): Promise<void> {
        mqttInstance.emit_cfg(key, cfgid)
    }

    async close() {
        if (this.#db) {
            await this.#db.close();
        }
    }
}

export const appDB = new AppDB();