import type Database from "@tauri-apps/plugin-sql";
import type { Node, Connection, PartialNode, PartialConnection, ReteData, PortConfig } from "./rete.type";
import { logger } from "../logger";
import JSON5 from "json5";

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
                    ref_type TEXT NOT NULL DEFAULT 'functor',
                    belong_id TEXT NOT NULL,
                    label TEXT,
                    x REAL NOT NULL DEFAULT 0,
                    y REAL NOT NULL DEFAULT 0,
                    cached_input TEXT,
                    cached_output TEXT,
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
                    extra TEXT,
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
            const msg = `Failed to initialize rete schema: ${error}`;
            logger.error(msg);
            throw new Error(msg);
        }
    }

    /**
     * 将数据库行转换为 Node 对象
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseNodeFromDb(row: any): Node {
        return {
            id: row.id,
            ref_id: row.ref_id,
            ref_type: row.ref_type || 'functor',
            belong_id: row.belong_id,
            label: row.label || undefined,
            x: row.x,
            y: row.y,
            cached_input: row.cached_input ? JSON5.parse(row.cached_input) as PortConfig[] : undefined,
            cached_output: row.cached_output ? JSON5.parse(row.cached_output) as PortConfig[] : undefined,
            extra: row.extra ? JSON5.parse(row.extra) as { [key: string]: unknown } : undefined,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    /**
     * 将数据库行转换为 Connection 对象
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseConnectionFromDb(row: any): Connection {
        return {
            id: row.id,
            belong_id: row.belong_id,
            from_id: row.from_id,
            from_output: row.from_output,
            to_id: row.to_id,
            to_input: row.to_input,
            extra: row.extra ? JSON5.parse(row.extra) as { [key: string]: unknown } : undefined,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    /**
     * 获取指定 belong_id 的所有 nodes 和 connections
     */
    public async getReteData(belongId: string): Promise<ReteData> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            const nodeRows = await this.#db.select<unknown[]>(
                'SELECT * FROM nodes WHERE belong_id = $1',
                [belongId]
            );

            const connectionRows = await this.#db.select<unknown[]>(
                'SELECT * FROM connections WHERE belong_id = $1',
                [belongId]
            );

            const nodes = nodeRows.map(row => this.parseNodeFromDb(row));
            const connections = connectionRows.map(row => this.parseConnectionFromDb(row));

            return { nodes, connections };
        } catch (error) {
            const msg = `Failed to get rete data: ${error}`;
            logger.error(msg);
            throw new Error(msg);
        }
    }

    /**
     * Upsert node - 如果存在则更新，否则插入
     */
    public async upsertNode(nodeData: PartialNode): Promise<void> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            // 先查询是否存在
            const existingRows = await this.#db.select<unknown[]>(
                'SELECT * FROM nodes WHERE id = $1',
                [nodeData.id]
            );

            const now = Math.floor(Date.now() / 1000);

            if (existingRows.length > 0) {
                // 更新：保留旧值,只更新提供的字段
                const old = this.parseNodeFromDb(existingRows[0]);
                const updated: Node = {
                    id: nodeData.id,
                    ref_id: nodeData.ref_id ?? old.ref_id,
                    ref_type: nodeData.ref_type ?? old.ref_type,
                    belong_id: nodeData.belong_id ?? old.belong_id,
                    label: nodeData.label !== undefined ? nodeData.label : old.label,
                    x: nodeData.x ?? old.x,
                    y: nodeData.y ?? old.y,
                    cached_input: nodeData.cached_input !== undefined ? nodeData.cached_input : old.cached_input,
                    cached_output: nodeData.cached_output !== undefined ? nodeData.cached_output : old.cached_output,
                    extra: {
                        ...old.extra,
                        ...nodeData.extra
                    },
                    created_at: old.created_at,
                    updated_at: now
                };

                await this.#db.execute(
                    `UPDATE nodes SET 
                        ref_id = $1, 
                        ref_type = $2,
                        belong_id = $3,
                        label = $4,
                        x = $5, 
                        y = $6,
                        cached_input = $7,
                        cached_output = $8,
                        extra = $9, 
                        updated_at = $10 
                    WHERE id = $11`,
                    [
                        updated.ref_id,
                        updated.ref_type,
                        updated.belong_id,
                        updated.label ?? null,
                        updated.x,
                        updated.y,
                        updated.cached_input ? JSON.stringify(updated.cached_input) : null,
                        updated.cached_output ? JSON.stringify(updated.cached_output) : null,
                        updated.extra ? JSON.stringify(updated.extra) : null,
                        updated.updated_at,
                        updated.id
                    ]
                );
            } else {
                // 插入：必填字段必须提供
                if (!nodeData.ref_id || !nodeData.belong_id) {
                    throw new Error('ref_id and belong_id are required for new nodes');
                }

                const newNode: Node = {
                    id: nodeData.id,
                    ref_id: nodeData.ref_id,
                    ref_type: nodeData.ref_type ?? 'functor',
                    belong_id: nodeData.belong_id,
                    label: nodeData.label,
                    x: nodeData.x ?? 0,
                    y: nodeData.y ?? 0,
                    cached_input: nodeData.cached_input,
                    cached_output: nodeData.cached_output,
                    extra: nodeData.extra,
                    created_at: now,
                    updated_at: now
                };

                await this.#db.execute(
                    `INSERT INTO nodes (id, ref_id, ref_type, belong_id, label, x, y, cached_input, cached_output, extra, created_at, updated_at) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        newNode.id,
                        newNode.ref_id,
                        newNode.ref_type,
                        newNode.belong_id,
                        newNode.label ?? null,
                        newNode.x,
                        newNode.y,
                        newNode.cached_input ? JSON.stringify(newNode.cached_input) : null,
                        newNode.cached_output ? JSON.stringify(newNode.cached_output) : null,
                        newNode.extra ? JSON.stringify(newNode.extra) : null,
                        newNode.created_at,
                        newNode.updated_at
                    ]
                );
            }
        } catch (error) {
            const msg = `Failed to upsert node: ${error}`;
            logger.error(msg);
            throw new Error(msg);
        }
    }

    /**
     * Upsert connection - 如果存在则更新，否则插入
     */
    public async upsertConn(connData: PartialConnection): Promise<void> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            // 先查询是否存在
            const existingRows = await this.#db.select<unknown[]>(
                'SELECT * FROM connections WHERE id = $1',
                [connData.id]
            );

            const now = Math.floor(Date.now() / 1000);

            if (existingRows.length > 0) {
                // 更新：保留旧值，只更新提供的字段
                const old = this.parseConnectionFromDb(existingRows[0]);
                const updated: Connection = {
                    id: connData.id,
                    belong_id: connData.belong_id ?? old.belong_id,
                    from_id: connData.from_id ?? old.from_id,
                    from_output: connData.from_output ?? old.from_output,
                    to_id: connData.to_id ?? old.to_id,
                    to_input: connData.to_input ?? old.to_input,
                    extra: {
                        ...old.extra,
                        ...connData.extra
                    },
                    created_at: old.created_at,
                    updated_at: now
                };

                await this.#db.execute(
                    `UPDATE connections SET 
                        belong_id = $1, 
                        from_id = $2, 
                        from_output = $3, 
                        to_id = $4, 
                        to_input = $5, 
                        extra = $6, 
                        updated_at = $7 
                    WHERE id = $8`,
                    [
                        updated.belong_id,
                        updated.from_id,
                        updated.from_output,
                        updated.to_id,
                        updated.to_input,
                        updated.extra ? JSON.stringify(updated.extra) : null,
                        updated.updated_at,
                        updated.id
                    ]
                );
            } else {
                // 插入：必填字段必须提供
                if (!connData.belong_id || !connData.from_id || !connData.from_output || !connData.to_id || !connData.to_input) {
                    throw new Error('belong_id, from_id, from_output, to_id, and to_input are required for new connections');
                }

                const newConn: Connection = {
                    id: connData.id,
                    belong_id: connData.belong_id,
                    from_id: connData.from_id,
                    from_output: connData.from_output,
                    to_id: connData.to_id,
                    to_input: connData.to_input,
                    extra: connData.extra,
                    created_at: now,
                    updated_at: now
                };

                await this.#db.execute(
                    `INSERT INTO connections (id, belong_id, from_id, from_output, to_id, to_input, extra, created_at, updated_at) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        newConn.id,
                        newConn.belong_id,
                        newConn.from_id,
                        newConn.from_output,
                        newConn.to_id,
                        newConn.to_input,
                        newConn.extra ? JSON.stringify(newConn.extra) : null,
                        newConn.created_at,
                        newConn.updated_at
                    ]
                );
            }
        } catch (error) {
            const msg = `Failed to upsert connection: ${error}`;
            logger.error(msg);
            throw new Error(msg);
        }
    }

    /**
     * 删除 node
     */
    public async rmNode(id: string): Promise<void> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            await this.#db.execute('DELETE FROM nodes WHERE id = $1', [id]);
        } catch (error) {
            const msg = `Failed to remove node: ${error}`;
            logger.error(msg);
            throw new Error(msg);
        }
    }

    /**
     * 删除 connection
     */
    public async rmConn(id: string): Promise<boolean> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            const result = await this.#db.execute('DELETE FROM connections WHERE id = $1', [id]);
            // console.log("rmConn result=",result);
            return result.rowsAffected >= 1
        } catch (error) {
            const msg = `Failed to remove connection: ${error}`;
            logger.error(msg);
            throw new Error(msg);
        }
    }
}