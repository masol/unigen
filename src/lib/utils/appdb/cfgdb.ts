import Database from '@tauri-apps/plugin-sql';
import JSON5 from 'json5'

export type ConfigItem<T = Record<string, unknown>> = {
    id: string,
    value: T,
    created_at: number,
    updated_at: number
}

type ConfigInner = {
    id: string,
    key: string,
    value: string,
    created_at: number,
    updated_at: number
}

function ConfigMapper(inner: ConfigInner): ConfigItem {
    return {
        id: inner.id,
        value: JSON5.parse(inner.value),
        created_at: inner.created_at,
        updated_at: inner.updated_at
    }
}

export class CfgDB {
    private db: Database | null = null;

    public get handle(): Database {
        if (!this.db) {
            throw new Error("Database Invalid");
        }
        return this.db;
    }

    async init(path: string, bInit = false): Promise<void> {
        try {
            // 加载数据库连接
            this.db = await Database.load(path);

            if (bInit) {
                await this.initializeSchema();
            }
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw new Error(`Failed to initialize database: ${error}`);
        }
    }

    /**
 * 初始化数据库表结构
 * 使用 CREATE TABLE IF NOT EXISTS 确保重入安全
 */
    private async initializeSchema(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not loaded');
        }

        try {
            // 创建 config 表（如果不存在）
            await this.db.execute(`
                CREATE TABLE IF NOT EXISTS config (
                    id TEXT PRIMARY KEY NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
                );
            `);

            // 创建索引（如果不存在）
            await this.db.execute(`
                CREATE INDEX IF NOT EXISTS idx_config_key ON config(key);
            `);

            // 创建触发器（如果不存在）
            await this.db.execute(`
                CREATE TRIGGER IF NOT EXISTS update_config_timestamp
                AFTER UPDATE ON config
                FOR EACH ROW
                BEGIN
                    UPDATE config SET updated_at = strftime('%s', 'now')
                    WHERE id = NEW.id;
                END;
            `);

            console.log('Database schema initialized successfully');
        } catch (error) {
            console.error('Schema initialization failed:', error);
            throw new Error(`Failed to initialize schema: ${error}`);
        }
    }

    // 1. 根据 key 进行 upsert（不存在则新建，存在且唯一则更新，存在多个则不操作）
    // @todo: 需要使用锁，否则并发访问数据库，此种分离处理可能会出错！
    async upsertByKey(key: string, value: string): Promise<{ success: boolean, id: string | null }> {
        if (!this.db) {
            throw new Error('Database not loaded');
        }

        // 查询该 key 的所有记录
        const existing = await this.db.select<Array<{ id: string, created_at: number }>>(
            'SELECT id, created_at FROM config WHERE key = $1',
            [key]
        );

        // 如果不存在记录，新建
        if (!existing || existing.length === 0) {
            const id = crypto.randomUUID();
            await this.db.execute(
                'INSERT INTO config (id, key, value, created_at, updated_at) VALUES ($1, $2, $3, strftime(\'%s\', \'now\'), strftime(\'%s\', \'now\'))',
                [id, key, value]
            );
            return { success: true, id };
        }

        // 如果有多个记录，不操作，返回 false
        if (existing.length > 1) {
            console.warn(`Key "${key}" has multiple records (${existing.length}), upsert skipped.`);
            return { success: false, id: null };
        }

        // 只有一个记录时，执行更新
        const record = existing[0];
        await this.db.execute(
            'UPDATE config SET value = $1, updated_at = strftime(\'%s\', \'now\') WHERE id = $2',
            [value, record.id]
        );
        return { success: true, id: record.id };
    }

    async upsertById(id: string, key: string, value: string): Promise<{ success: boolean, id: string }> {
        if (!this.db) {
            throw new Error('Database not loaded');
        }

        // 查询该 ID 是否存在
        const existing = await this.db.select<Array<{ id: string }>>(
            'SELECT id FROM config WHERE id = $1',
            [id]
        );

        // 如果不存在，新建
        if (!existing || existing.length === 0) {
            await this.db.execute(
                'INSERT INTO config (id, key, value, created_at, updated_at) VALUES ($1, $2, $3, strftime(\'%s\', \'now\'), strftime(\'%s\', \'now\'))',
                [id, key, value]
            );
            return { success: true, id };
        }

        // 如果存在，更新
        await this.db.execute(
            'UPDATE config SET key = $1, value = $2, updated_at = strftime(\'%s\', \'now\') WHERE id = $3',
            [key, value, id]
        );
        return { success: true, id };
    }

    // 2. 插入新记录
    async insert(key: string, value: string): Promise<{ success: boolean, id: string | null }> {
        try {
            const id = crypto.randomUUID();
            await this.handle.execute(
                'INSERT INTO config (id, key, value, created_at, updated_at) VALUES ($1, $2, $3, strftime(\'%s\', \'now\'), strftime(\'%s\', \'now\'))',
                [id, key, value]
            );
            return { success: true, id };
        } catch (error) {
            console.error(`Failed to insert record with key "${key}":`, error);
            return { success: false, id: null };
        }
    }

    // 3. 根据 id 删除记录
    async remove(id: string): Promise<{ success: boolean }> {
        try {
            await this.handle.execute(
                'DELETE FROM config WHERE id = $1',
                [id]
            );
            return { success: true };
        } catch (error) {
            console.error(`Failed to remove record with id "${id}":`, error);
            return { success: false };
        }
    }

    async getConfigsByKey(key: string): Promise<ConfigItem[]> {
        const results = await this.handle.select<ConfigInner[]>(
            'SELECT id, key, value, created_at, updated_at FROM config WHERE key = $1',
            [key]
        );
        return results.map(ConfigMapper);
    }

    async getConfigById(id: string): Promise<ConfigItem | null> {
        const results = await this.handle.select<ConfigInner[]>(
            'SELECT id, key, value, created_at, updated_at FROM config WHERE id = $1',
            [id]
        );
        return results.length > 0 ? ConfigMapper(results[0]) : null;
    }

    async close() {
        if (this.db) {
            // 不能主动close,会关闭连接池.只能依赖GC来被动释放.@todo: 查阅文档以确认GC会释放underline database.
            // await this.db.close();
            this.db = null;
        }
    }
}