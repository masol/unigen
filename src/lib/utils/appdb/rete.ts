import type Database from "@tauri-apps/plugin-sql";


export class ReteDb {
    #db: Database | null = null;

    public async resetDb(db: Database | null) {
        if (db === this.#db) return;

        this.#db = db;
        if (this.#db) {
            await this.initSchema();
        }
    }


    /**
    * 初始化节点和连接表结构
    * 使用 CREATE TABLE IF NOT EXISTS 确保重入安全
    */
    private async initSchema(): Promise<void> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            // 创建 nodes 表（如果不存在）
            await this.#db.execute(`
            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY NOT NULL,
                ref_id TEXT NOT NULL,
                belong_id TEXT NOT NULL,
                extra TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );
        `);

            // 创建 nodes 表索引（如果不存在）
            await this.#db.execute(`
            CREATE INDEX IF NOT EXISTS idx_nodes_belong_id ON nodes(belong_id);
        `);

            await this.#db.execute(`
            CREATE INDEX IF NOT EXISTS idx_nodes_ref_id ON nodes(ref_id);
        `);

            // 创建 connections 表（如果不存在）
            await this.#db.execute(`
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY NOT NULL,
                belong_id TEXT NOT NULL,
                from_id TEXT NOT NULL,
                from_output TEXT NOT NULL,
                to_id TEXT NOT NULL,
                to_input TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );
        `);

            // 创建 connections 表索引（如果不存在）
            await this.#db.execute(`
            CREATE INDEX IF NOT EXISTS idx_connections_belong_id ON connections(belong_id);
        `);

            console.log('Rete schema (nodes and connections) initialized successfully');
        } catch (error) {
            console.error('Rete schema initialization failed:', error);
            throw new Error(`Failed to initialize rete schema: ${error}`);
        }
    }
}
