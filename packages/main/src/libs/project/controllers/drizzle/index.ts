import { app } from "electron";
import path, { join } from "path";
import { metaDirName, type IProjectContext } from "../../type.js";
import { fileURLToPath } from "url";
import Logger from "electron-log/main.js";
import { ensureDir, pathExists } from "fs-extra";
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '$libs/utils/db/schema/index.js'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
// import { PrjJob } from "../../helper/job.js";
import { BaseProjectController } from "../base.js";
import { throwNotfound, throwPrecondition } from "$libs/utils/err.js";
import { DrizzleDBType } from "./type.js";
import type { Capability } from "$types/blueprint/capability.js";
import { upsertCapability, getCapabilityById, deleteCapabilityById } from './capa.js'

const dbName = 'db.sqlite'

export class PrjDB extends BaseProjectController {
    private migrationsPath: string = ""
    private dqlite: Database.Database | null = null;
    private db: DrizzleDBType | null = null;
    // #job: PrjJob | null = null;
    constructor(ctx: IProjectContext) {
        super(ctx)
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        this.migrationsPath = app.isPackaged
            ? path.join(process.resourcesPath, 'drizzle') // 生产环境：拷贝的物理路径
            //当前路径是dist中。
            : path.join(__dirname, '../src/libs/utils/db/migrations');

        Logger.info(`[Project:DB] migrationsPath= ${this.migrationsPath}`)
    }

    static ensure(ctx: IProjectContext): PrjDB { return this.coreEnsure(this, ctx); }

    ensureDB(): DrizzleDBType {
        if (!this.db) {
            throwPrecondition("Drizzle数据库未初始化。")
        }
        return this.db;
    }


    // get job(): PrjJob {
    //     if (!this.#job) {
    //         throwNotfound(`未初始化的项目任务队列！`)
    //     }
    //     return this.#job;
    // }

    close() {
        // if (this.#job) {
        //     this.#job.forceShutdown();
        // }
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
            // 加入超时，防止在多进程或密集写入时死锁
            timeout: 5000
        });

        // 1. 明确关闭外键约束（SQLite 默认其实是 OFF，这里显式关闭确保性能最大化）
        this.dqlite.pragma('foreign_keys = OFF');

        // 2. 开启 WAL 模式（预写日志模式：读写不互斥，写入速度直接飙升数倍）
        this.dqlite.pragma('journal_mode = WAL');

        // 3. 将同步模式设为 NORMAL
        // 在 WAL 模式下，NORMAL 非常安全，它不会每次都强制把数据刷入磁盘，而是写到操作系统的缓存中，性能极高
        this.dqlite.pragma('synchronous = NORMAL');

        // 4. 增大缓存大小（单位是页，4000 约等于 16MB 的内存缓存，减少频繁读写磁盘）
        this.dqlite.pragma('cache_size = 4000');

        // 5. 将临时文件存在内存中，而不是磁盘
        this.dqlite.pragma('temp_store = MEMORY');

        this.db = drizzle(this.dqlite, { schema });
        migrate(this.db, { migrationsFolder: this.migrationsPath });
        // this.#job = new PrjJob(this.dqlite);
        // await this.#job.init();
    }

    // 1. 让检查方法直接返回非空的 DrizzleType
    private getInitedDB(): DrizzleDBType {
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
            .run(); // 同步执行，执行完后此行代码才向下走
    }


    remove(key: string): void {
        const db = this.getInitedDB();
        db.delete(schema.kvStore)
            .where(eq(schema.kvStore.key, key))
            .run();
    }

    get<T>(key: string): T | null {
        const db = this.getInitedDB();
        const result = db
            .select({ value: schema.kvStore.value })
            .from(schema.kvStore)
            .where(eq(schema.kvStore.key, key))
            .get();

        return result ? (result.value as T) : null;
    }

    getWithTime<T>(key: string): { value: T, updatedAt: string | null } | null {
        const db = this.getInitedDB();
        const result = db
            .select({ value: schema.kvStore.value, updatedAt: schema.kvStore.updatedAt })
            .from(schema.kvStore)
            .where(eq(schema.kvStore.key, key))
            .get();

        return result ? ({
            value: result.value as T,
            updatedAt: result.updatedAt
        }) : null;
    }

    upsertCapa(capability: Partial<Capability>): Capability {
        return upsertCapability(this.ensureDB(), capability);
    }

    getCapaById(id: string): Capability | null {
        return getCapabilityById(this.ensureDB(), id);
    }


    rmCapaById(id: string): Capability | null {
        return deleteCapabilityById(this.ensureDB(), id);
    }


    dispose(): void {
        this.close();
    }
}
