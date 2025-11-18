import type Database from "@tauri-apps/plugin-sql";
import type { EntityData, FlowData, FunctorData, WordData, WordType } from "./type";
import JSON5 from "json5";
import { localeStore } from "$lib/stores/config/ipc/i18n.svelte";

export type CogmindData = EntityData | FlowData | FunctorData;

// 数据库行类型
interface CogmindRow {
    id: string;
    concept_id: number;
    word: string;
    definition: string | null;
    lang: string;
    synonym: string | null;
    type: WordType;
    extra: string | null;
    created_at: number;
    updated_at: number;
}

export class CogmindDb {
    #db: Database | null = null;
    #maxId: number = -1;

    public async resetDb(db: Database | null) {
        if (db === this.#db) return;

        this.#db = db;
        if (this.#db) {
            await this.initSchema();
            this.#maxId = await this.getMaxConceptId();
        }
    }

    private async initSchema(): Promise<void> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            await this.#db.execute(`
                CREATE TABLE IF NOT EXISTS cogmind (
                    id TEXT PRIMARY KEY NOT NULL,
                    concept_id INTEGER UNIQUE NOT NULL,
                    word TEXT NOT NULL,
                    definition TEXT,
                    lang TEXT NOT NULL,
                    synonym TEXT,
                    type TEXT NOT NULL CHECK(type IN ('entity', 'functor', 'flow')),
                    extra TEXT,
                    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
                );
            `);

            // 创建索引
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_cogmind_concept_id ON cogmind(concept_id)',
                'CREATE INDEX IF NOT EXISTS idx_cogmind_type ON cogmind(type)'
            ];

            for (const index of indexes) {
                await this.#db.execute(index);
            }

            console.log('Cogmind schema initialized successfully');
        } catch (error) {
            console.error('Cogmind schema initialization failed:', error);
            throw new Error(`Failed to initialize Cogmind schema: ${error}`);
        }
    }

    /**
     * 删除记录
     */
    async remove(id: string): Promise<boolean> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            const result = await this.#db.execute(
                'DELETE FROM cogmind WHERE id = ?',
                [id]
            );
            return result.rowsAffected > 0;
        } catch (error) {
            console.error('Remove failed:', error);
            throw new Error(`Failed to remove record with id ${id}: ${error}`);
        }
    }

    /**
     * 通用 upsert 方法
     * 支持部分更新，只更新提供的字段
     * 返回id.
     */
    async upsert(
        data: Partial<CogmindData> & { id?: string; type: WordType }
    ): Promise<string> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            const id = data.id || crypto.randomUUID();
            const now = Math.floor(Date.now() / 1000);

            // id不同(新的randomUUID)，一定属于新建．
            if (id !== data.id) {
                return await this.insertRecord(id, data, now);
            }

            // 有data.id，不一定有记录，这里检查记录是否存在
            const existing = await this.getRowById(id);

            if (existing) {
                return await this.updateRecord(id, data, now);
            } else {
                return await this.insertRecord(id, data, now);
            }
        } catch (error) {
            console.error('Upsert failed:', error);
            throw new Error(`Failed to upsert data: ${error}`);
        }
    }

    /**
     * 获取数据库原始行
     */
    private async getRowById(id: string): Promise<CogmindRow | null> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        const result = await this.#db.select<CogmindRow[]>(
            'SELECT * FROM cogmind WHERE id = ?',
            [id]
        );

        return result.length > 0 ? result[0] : null;
    }

    /**
     * 将数据库行转换为 CogmindData 对象
     */
    private rowToData<T extends WordData>(row: CogmindRow): T {
        return {
            id: row.id,
            concept_id: row.concept_id,
            word: row.word,
            definition: row.definition || undefined,
            lang: row.lang,
            synonym: row.synonym ? JSON5.parse(row.synonym) : undefined,
            type: row.type,
            extra: row.extra ? JSON5.parse(row.extra) : undefined,
            created_at: row.created_at,
            updated_at: row.updated_at,
        } as T;
    }

    /**
     * 序列化字段值（处理 JSON 和布尔值）
     */
    private serializeField(value: unknown): string | number | null {
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return value as any;
    }

    /**
     * 更新现有记录（只更新提供的字段），返回id.
     */
    private async updateRecord(
        id: string,
        data: Partial<CogmindData>,
        now: number
    ): Promise<string> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        // 构建动态 UPDATE 语句
        const updates: string[] = [];
        const values: unknown[] = [];

        // 定义可更新的字段
        const updatableFields: (keyof CogmindData)[] = [
            'word', 'definition', 'lang', 'synonym', 'extra'
        ];

        for (const field of updatableFields) {
            if (field in data) {
                updates.push(`${field} = ?`);
                values.push(this.serializeField(data[field]));
            }
        }

        // 如果没有字段需要更新，直接返回现有数据
        if (updates.length === 0) {
            throw new Error("updatableFields 不是最新的？无法构建更新SQL.")
            // return this.rowToData(existingRow);
        }

        // 总是更新 updated_at
        updates.push('updated_at = ?');
        values.push(now);
        values.push(id);

        const result = await this.#db.execute(
            `UPDATE cogmind SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        return result.rowsAffected > 0 ? id : "";

        // 重新获取更新后的数据
        // const updated = await this.getRowById(id);
        // if (!updated) {
        //     throw new Error(`Failed to retrieve updated record with id ${id}`);
        // }

        // return this.rowToData(updated);
    }

    /**
     * 插入新记录,返回id.
     */
    private async insertRecord(
        id: string,
        data: Partial<CogmindData>,
        now: number
    ): Promise<string> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        // 验证必需字段
        if (!data.type) {
            throw new Error('Type is required for new records');
        }
        if (!data.word) {
            data.word = "";
            // throw new Error('Word is required for new records');
        }
        if (!data.lang) {
            data.lang = localeStore.lang;
            // throw new Error('Lang is required for new records');
        }

        const conceptId = data.concept_id ?? this.getNextConceptId();

        const result = await this.#db.execute(
            `INSERT INTO cogmind (
                id, concept_id, word, definition, lang, 
                synonym, type, extra, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                conceptId,
                data.word,
                this.serializeField(data.definition),
                data.lang,
                this.serializeField(data.synonym),
                data.type,
                this.serializeField(data.extra),
                now,
                now,
            ]
        );

        return result.rowsAffected > 0 ? id : "";

        // const inserted = await this.getRowById(id);
        // if (!inserted) {
        //     throw new Error(`Failed to retrieve inserted record with id ${id}`);
        // }

        // return this.rowToData(inserted);
    }

    /**
     * 根据 ID 获取完整记录
     */
    async getById<T extends WordData>(id: string): Promise<T | null> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            const row = await this.getRowById(id);
            return row ? this.rowToData<T>(row) : null;
        } catch (error) {
            console.error('Get by ID failed:', error);
            throw new Error(`Failed to get record with id ${id}: ${error}`);
        }
    }

    /**
     * 根据类型获取所有记录
     */
    async getAllByType<T extends CogmindData>(type: WordType): Promise<T[]> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            const result = await this.#db.select<CogmindRow[]>(
                'SELECT * FROM cogmind WHERE type = ? ORDER BY updated_at DESC',
                [type]
            );

            return result.map(row => this.rowToData<T>(row));
        } catch (error) {
            console.error('Get all by type failed:', error);
            throw new Error(`Failed to get records of type ${type}: ${error}`);
        }
    }

    /**
     * 获取最大的 concept_id
     */
    private async getMaxConceptId(): Promise<number> {
        if (!this.#db) {
            throw new Error('Database not loaded');
        }

        try {
            const result = await this.#db.select<Array<{ max_id: number | null }>>(
                'SELECT MAX(concept_id) as max_id FROM cogmind'
            );

            return result.length > 0 && result[0].max_id !== null ? result[0].max_id : 0;
        } catch (error) {
            console.error('Failed to get max concept_id:', error);
            throw new Error(`Failed to get max concept_id: ${error}`);
        }
    }

    /**
     * 获取下一个 concept_id
     */
    public getNextConceptId(): number {
        if (this.#maxId < 0) {
            throw new Error("Max ID not initialized from database");
        }

        this.#maxId = this.#maxId + 1;
        return this.#maxId;
    }

    get maxId(): number {
        if (this.#maxId < 0) {
            throw new Error("Max ID not initialized from database");
        }
        return this.#maxId;
    }
}