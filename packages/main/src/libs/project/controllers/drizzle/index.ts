// packages/main/src/libs/project/controllers/drizzle/index.ts
//
// PrjDB —— 项目持久化门面
//
// 职责仅限于:
//   1. SQLite 连接的生命周期管理 (open / close / migrate)
//   2. KV 订阅通知状态 (subKeys)
//   3. 对外暴露扁平 API，内部委托给同目录各领域模块
//
// 具体业务实现分散在:
//   kvstore.ts  — KV 底层读写
//   capa.ts     — 能力表
//   metag.ts    — 元术语表
//   chat.ts     — 会话 / 消息 / Trace
//   list.ts     — 蓝图统一列表
//   content.ts  — getContent / setContent 多态入口

import { type MetagRow, type NewMetagRow } from '$libs/blueprint/metag/is.js';
import * as schema from '$libs/utils/db/schema/index.js';
import { throwNotfound, throwNotimplement, throwPrecondition } from "$libs/utils/err.js";
import type { Capability, NewCapability } from "$types/blueprint/capability.js";
import type { PrjTimeStamps, PrjTimeStore } from "$types/prjstore.js";
import { BlueprintKind, GetItemInput, GetListResponse, QueryParams, SetItem } from '$types/shared/api/list.js';
import type {
    AgentIdentity,
    ChatMessage,
    ChatSession,
    GetMessageOptions,
    ListMessagesParams,
    ListSessionsParams,
    NewChatMessage,
    NewChatSession,
    TraceNode,
    TracePatch,
} from "$types/shared/chat.js";
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from "electron";
import Logger from "electron-log/main.js";
import { ensureDir, pathExists } from "fs-extra";
import { dirname, join } from "path";
import { getErrorMessage } from 'radashi';
import { fileURLToPath } from "url";
import { metaDirName, type EmbedKVStore, type IProjectContext } from "../../type.js";
import { BaseProjectController } from "../base.js";
import {
    deleteCapabilityById,
    getCapabilityById,
    getCapaTimestamps,
    upsertCapability,
} from './capa.js';
import {
    appendMessageDelta,
    appendTraceDetail,
    createSession,
    deleteMessage,
    deleteSession,
    finishMessage,
    getMessage,
    getSession,
    listMessages,
    listSessions,
    listTracesByMessage,
    patchTrace,
    saveMessage,
    saveTraces,
    updateSessionTitle,
    upsertTrace,
} from './chat.js';
import { getContent, setContent } from './content.js';
import {
    getKV,
    getKVsByGlob,
    getKVUpdTime,
    getKVWithTime,
    removeKV,
    removeKVByGlob,
    setKV,
} from './kvstore.js';
import { getList } from './list.js';
import {
    deleteMetag,
    getMetag,
    getMetagTimestamps,
    upcertMetag,
} from './metag.js';
import type { DrizzleDBType } from "./type.js";

const dbName = 'db.sqlite';

export class PrjDB extends BaseProjectController implements EmbedKVStore {
    static readonly serviceKey = Symbol.for('project.controller.PrjDB');

    private migrationsPath: string = "";
    private dqlite: Database.Database | null = null;
    private db: DrizzleDBType | null = null;
    private subKeys: Set<string> = new Set();

    constructor(ctx: IProjectContext) {
        super(ctx);
        const __dirname = dirname(fileURLToPath(import.meta.url));
        this.migrationsPath = app.isPackaged
            ? join(process.resourcesPath, 'drizzle')
            : join(__dirname, '../src/libs/utils/db/migrations');

        Logger.info(`[Project:DB] migrationsPath= ${this.migrationsPath}`);
    }

    static ensure(ctx: IProjectContext): PrjDB { return this.coreEnsure(this, ctx); }

    ensureDB(): DrizzleDBType {
        if (!this.db) throwPrecondition("Drizzle数据库未初始化。");
        return this.db;
    }

    /* ──────────── 连接生命周期 ──────────── */

    forceClose(): void {
        this.clearSubs();
        if (this.dqlite) {
            try {
                Logger.info('[Database] 强制断开数据库连接...');
                if (this.dqlite.open) {
                    try { this.dqlite.pragma('wal_checkpoint(TRUNCATE)'); }
                    catch (_) { /* 忽略 checkpoint 失败 */ }
                    this.dqlite.close();
                }
            } catch (error) {
                Logger.error('[Database] 强制关闭数据库时发生错误:', error);
            } finally {
                this.dqlite = null;
                this.db = null;
            }
        }
    }

    close() {
        this.forceClose();
        Logger.debug('[Database] 数据库已成功关闭，文件锁已释放。');
    }

    async open(bCreate: boolean = false): Promise<void> {
        const dbPath = join(this.ctx.path, metaDirName, dbName);
        const exists = await pathExists(dbPath);
        if (!exists) {
            if (!bCreate) throwNotfound(`任务"${this.ctx.path}"的数据库不存在！`);
            await ensureDir(join(this.ctx.path, metaDirName));
        }
        this.forceClose();

        this.dqlite = new Database(dbPath, { timeout: 5000 });
        this.dqlite.pragma('foreign_keys = OFF');
        this.dqlite.pragma('journal_mode = WAL');
        this.dqlite.pragma('synchronous = NORMAL');
        this.dqlite.pragma('cache_size = 4000');
        this.dqlite.pragma('temp_store = MEMORY');

        this.db = drizzle(this.dqlite, { schema });
        try {
            migrate(this.db, { migrationsFolder: this.migrationsPath });
        } catch (e) {
            Logger.error("[drizzle] 数据库迁移失败，尝试继续执行:", getErrorMessage(e));
        }
    }

    dispose(): void {
        this.forceClose();
    }

    /* ──────────── 订阅 (notify on kv-changed) ──────────── */

    clearSubs() { this.subKeys.clear(); }
    addSub(key: string) { this.subKeys.add(key); }
    rmSub(key: string) { this.subKeys.delete(key); }

    /* ──────────── KV ──────────── */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set(key: string, value: any): void {
        setKV(this.ensureDB(), key, value);
        if (this.subKeys.has(key)) {
            this.ctx.notify("kv-changed", { key, value });
        }
    }

    get<T>(key: string): T | null {
        return getKV<T>(this.ensureDB(), key);
    }

    getWithTime<T>(key: string): PrjTimeStore<T> | null {
        return getKVWithTime<T>(this.ensureDB(), key);
    }

    remove(key: string): void {
        removeKV(this.ensureDB(), key);
    }

    removeByGlob(pattern: string): void {
        removeKVByGlob(this.ensureDB(), pattern);
    }

    getByGlob(pattern: string): string[] {
        return getKVsByGlob(this.ensureDB(), pattern);
    }

    geUpdTime(key: string): string | null;
    geUpdTime(key: string[]): Record<string, string>;
    geUpdTime(key: string | string[]): string | null | Record<string, string> {
        // 调用重载实现签名的 getKVUpdTime；参数类型联合，返回类型联合
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return getKVUpdTime(this.ensureDB(), key as any);
    }

    /* ──────────── Capability ──────────── */

    upcertCapa(c: NewCapability): string { return upsertCapability(this.ensureDB(), c); }
    getCapaById(id: string): Capability | null { return getCapabilityById(this.ensureDB(), id); }
    rmCapaById(id: string): void { deleteCapabilityById(this.ensureDB(), id); }
    getCapaTimes(id: string): PrjTimeStamps | null { return getCapaTimestamps(this.ensureDB(), id); }

    /* ──────────── Metag ──────────── */

    getMetag(id: string | string[]): (MetagRow | null)[] { return getMetag(this.ensureDB(), id); }
    rmMetag(id: string | string[]): void { deleteMetag(this.ensureDB(), id); }
    upcertMetag(m: NewMetagRow | NewMetagRow[]): void { upcertMetag(this.ensureDB(), m); }
    getMetagTimes(id: string | string[]): (PrjTimeStamps | null)[] {
        return getMetagTimestamps(this.ensureDB(), id);
    }

    /* ──────────── Blueprint 列表 ──────────── */

    list<K extends BlueprintKind>(input: QueryParams & { kind: K }): GetListResponse {
        return getList(this.ensureDB(), input);
    }

    /* ──────────── Content 多态 ──────────── */

    getContent(input: GetItemInput): string {
        return getContent(this.ensureDB(), input);
    }

    setContent(input: SetItem): string {
        return setContent(this.ensureDB(), input);
    }

    verifyContent(_setInfo: SetItem): string[] {
        throwNotimplement("尚未实现内容验证，自行小心。");
    }

    /* ──────────── Chat: Sessions ──────────── */

    createSession(input?: NewChatSession): string {
        return createSession(this.ensureDB(), input);
    }

    getSession(id: string): ChatSession | null {
        return getSession(this.ensureDB(), id);
    }

    listSessions(params?: ListSessionsParams): ChatSession[] {
        return listSessions(this.ensureDB(), params);
    }

    /**
     * 修改会话标题。
     * @param manual 用户手动改题时传 true；自动改题 (默认 false) 会在用户已改过时静默跳过。
     */
    updateSessionTitle(id: string, title: string, manual: boolean = false): void {
        updateSessionTitle(this.ensureDB(), id, title, manual);
    }

    deleteSession(id: string): void {
        deleteSession(this.ensureDB(), id);
    }

    /* ──────────── Chat: Messages ──────────── */

    saveMessage(msg: NewChatMessage): string {
        return saveMessage(this.ensureDB(), msg);
    }

    getMessage(id: string, opts?: GetMessageOptions): ChatMessage | null {
        return getMessage(this.ensureDB(), id, opts);
    }

    listMessages(params: ListMessagesParams): ChatMessage[] {
        return listMessages(this.ensureDB(), params);
    }

    deleteMessage(id: string): void {
        deleteMessage(this.ensureDB(), id);
    }

    /** 流式追加消息内容增量 */
    appendMessageDelta(messageId: string, delta: string): void {
        appendMessageDelta(this.ensureDB(), messageId, delta);
    }

    /** 完成消息：设置最终内容、错误标记、agent 身份 */
    finishMessage(messageId: string, opts?: { content?: string; isError?: boolean; agent?: AgentIdentity }): void {
        finishMessage(this.ensureDB(), messageId, opts);
    }

    /* ──────────── Chat: Traces (流式增量 + 快照) ──────────── */

    /** 流式写入：trace.start 事件 → upsertTrace */
    upsertTrace(messageId: string, parentId: string | null | undefined, node: TraceNode): void {
        upsertTrace(this.ensureDB(), messageId, parentId, node);
    }

    /** 流式写入：trace.update / trace.end 事件 → patchTrace */
    patchTrace(nodeId: string, patch: TracePatch): void {
        patchTrace(this.ensureDB(), nodeId, patch);
    }

    /** 流式写入：trace.detail.delta 事件 → appendTraceDetail */
    appendTraceDetail(nodeId: string, delta: string): void {
        appendTraceDetail(this.ensureDB(), nodeId, delta);
    }

    /** 快照路径：一次性接管整条消息的 trace 树 (导入/恢复场景使用) */
    saveTraces(messageId: string, tree: TraceNode[] | undefined): void {
        saveTraces(this.ensureDB(), messageId, tree);
    }

    listTracesByMessage(messageId: string): TraceNode[] {
        return listTracesByMessage(this.ensureDB(), messageId);
    }
}