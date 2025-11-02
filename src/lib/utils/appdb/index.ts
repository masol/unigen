import { eventBus } from '../evt';
import { pipe, map, unique } from 'remeda';
import { invoke } from "@tauri-apps/api/core";
import { CfgDB, type ConfigItem } from './cfgdb';

type Change = {
    id: string;
    key: string;
    ctime: number;
}

class AppDB {
    #db: CfgDB = new CfgDB();
    #latest: number = 0;
    #unsub: (() => void) | null = null;

    async init() {
        // @todo: appWindow.onCloseRequested(async (event) => 中清理．(以后改进)
        this.#unsub = await eventBus.listen(eventBus.tauriEvt("cfgchanged"), () => {
            this.chkChange();
        });

        await this.#db.init("sqlite:app.db", false);

        // 获取最近时间的一条记录并存储 ctime
        const result = await this.#db.handle.select<Array<{ ctime: number }>>(
            "SELECT ctime FROM change ORDER BY ctime DESC LIMIT 1"
        );

        this.#latest = result.length > 0 ? result[0].ctime : 0;

        if (result.length > 0) {
            //删除1小时以上的记录．
            const oneHourAgo = Math.floor(Date.now() / 1000) - (60 * 60);
            await this.#db.handle.execute(
                "DELETE FROM change WHERE ctime < ?",
                [oneHourAgo]
            );
        }
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
        try {
            // 获取当前时间戳（秒）
            const now = Math.floor(Date.now() / 1000);

            // 插入变更记录
            await this.#db.handle.execute(
                'INSERT INTO change (key, cfgid, ctime) VALUES ($1, $2, $3)',
                [key, cfgid, now]
            );

            // 更新 latest 时间戳
            this.#latest = now;

            // 通知变更．

            await invoke("emit_cfg_changed");
        } catch (error) {
            console.error(`Failed to record config change for key "${key}":`, error);
        }
    }

    private async chkChange() {
        const results = await this.#db.handle.select<Change[]>(
            "SELECT * FROM change WHERE ctime > $1 ORDER BY ctime ASC",
            [this.#latest]
        );

        // console.log("chkChange results=", results);

        if (results.length > 0) {
            // 提取唯一的 key 并为每个 key 触发一次事件
            const uniqueKeys: string[] = pipe(
                results,
                map((change: Change) => change.key),
                unique()
            );

            uniqueKeys.forEach(key => eventBus.emit(`cfgchanged:${key}`, { key }));

            // 更新 latest 时间戳到最新的变更记录
            this.#latest = results[results.length - 1].ctime;
        }
    }

    async close() {
        if (this.#unsub) {
            this.#unsub();
            this.#unsub = null;
        }
        if (this.#db) {
            await this.#db.close();
        }
    }
}

export const appDB = new AppDB();