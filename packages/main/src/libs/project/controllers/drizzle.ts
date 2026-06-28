import { app } from "electron";
import path, { join } from "path";
import { metaDirName, type IProjectContext } from "../type.js";
import { fileURLToPath } from "url";
import Logger from "electron-log/main.js";
import { ensureDir, pathExists } from "fs-extra";
import Database from 'better-sqlite3'
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '$libs/utils/db/schema/index.js'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { PrjJob } from "../helper/job.js";
import { BaseProjectController } from "./base.js";
import { throwNotfound } from "$libs/utils/err.js";

const dbName = 'db.sqlite'

type DrizzleType = BetterSQLite3Database<typeof schema>;

export class PrjDB extends BaseProjectController {
    private migrationsPath: string = ""
    private dqlite: Database.Database | null = null;
    private db: DrizzleType | null = null;
    #job: PrjJob | null = null;
    constructor(ctx: IProjectContext) {
        super(ctx)
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        this.migrationsPath = app.isPackaged
            ? path.join(process.resourcesPath, 'drizzle') // 生产环境：拷贝的物理路径
            //当前路径是dist中。
            : path.join(__dirname, '../src/libs/utils/db/migrations');

        Logger.info(`[Project:DB] migrationsPath= ${this.migrationsPath}`)
    }

    static ensure(ctx: IProjectContext) { return this.coreEnsure(this, ctx); }


    get job(): PrjJob {
        if (!this.#job) {
            throwNotfound(`未初始化的项目任务队列！`)
        }
        return this.#job;
    }

    close() {
        if (this.#job) {
            this.#job.forceShutdown();
        }
        if (this.dqlite && this.dqlite.open) {
            try {
                Logger.info('[Database] 正在安全断开数据库连接，写入 WAL 缓冲区...');

                // 优化：在关闭前强制执行一次检查点，把内存和 WAL 日志中的数据彻底刷入磁盘
                this.dqlite.pragma('wal_checkpoint(TRUNCATE)');

                this.dqlite.close();
                this.dqlite = null;
                this.db = null;
                console.log('[Database] 数据库已成功关闭，文件锁已释放。');
            } catch (error) {
                console.error('[Database] 关闭数据库时发生错误:', error);
            }
        }
    }

    async open(bCreate: boolean = false): Promise<void> {
        const dbPath = join(this.ctx.path, metaDirName, dbName);
        const exists = await pathExists(dbPath);
        if (!exists) {
            if (!bCreate) {
                throwNotfound(`项目“${this.ctx.path}”的数据库不存在！`)
            }
            await ensureDir(join(this.ctx.path, metaDirName));
        }
        // 关闭，如果存在旧数据。
        this.close();

        this.dqlite = new Database(dbPath, {
            // 最佳实践选项：可以加入超时，防止在多进程或密集写入时死锁
            timeout: 5000
        });

        this.db = drizzle(this.dqlite, { schema });
        migrate(this.db, { migrationsFolder: this.migrationsPath });
        this.#job = new PrjJob(this.dqlite);
        await this.#job.init();
    }

    // 1. 让检查方法直接返回非空的 DrizzleType
    private getInitedDB(): DrizzleType {
        if (!this.db) {
            throw new Error("项目数据库未初始化");
        }
        return this.db;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set(key: string, value: any): void {
        const db = this.getInitedDB();
        db.insert(schema.kvStore)
            .values({ key, value })
            .onConflictDoUpdate({
                target: schema.kvStore.key,
                set: { value },
            })
            .run(); // ⚡ 同步执行，执行完后此行代码才向下走
    }

    get<T>(key: string): T | null {
        const db = this.getInitedDB();
        const result = db
            .select({ value: schema.kvStore.value })
            .from(schema.kvStore)
            .where(eq(schema.kvStore.key, key))
            .get(); // ⚡ 同步执行

        return result ? (result.value as T) : null;
    }

    getWithTime<T>(key: string): { value: T, updatedAt: string | null } | null {
        const db = this.getInitedDB();
        const result = db
            .select({ value: schema.kvStore.value, updatedAt: schema.kvStore.updatedAt })
            .from(schema.kvStore)
            .where(eq(schema.kvStore.key, key))
            .get(); // ⚡ 同步执行

        return result ? ({
            value: result.value as T,
            updatedAt: result.updatedAt
        }) : null;
    }


    dispose(): void {
        this.close();
    }
}
