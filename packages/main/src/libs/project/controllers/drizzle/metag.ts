import type { MetagRow, NewMetagRow } from "$libs/utils/blueprint/metag/is.js";
import { metag } from "$libs/utils/db/schema/metag.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { PrjTimeStamps } from "$types/prjstore.js";
import { eq, inArray } from 'drizzle-orm';
import type { DrizzleDBType } from "./type.js";

/* ==============================================================
 *   Upsert
 * ============================================================== */

/**
 * 插入或更新元术语记录 (以 fieldKey 为唯一键)
 *
 * 说明:
 *  - fieldKey 缺失或非法时抛错 (元术语表以 fieldKey 为主键，绝不允许空)
 *  - 不覆盖 createdAt，updatedAt 由 drizzle $onUpdate 自动刷新
 *  - 传入的 schema 为活的 Zod 实例；由 zodSchemaJsonType 自动脱水
 */
function upsertMetagSingle(db: DrizzleDBType, m: NewMetagRow): void {
    if (!m.fieldKey || typeof m.fieldKey !== 'string') {
        throwPrecondition(`upsertMetag: fieldKey is required, got: ${JSON.stringify(m)}`)
    }
    // 去掉时间戳字段，交由 drizzle 的 $defaultFn / $onUpdate 处理
    const { createdAt, updatedAt, ...insertData } = m;
    void (createdAt);
    void (updatedAt);

    db.insert(metag)
        .values(insertData)
        .onConflictDoUpdate({
            target: metag.fieldKey,
            set: insertData,
        })
        .run();
}

/**
 * 批量 upsert
 *
 * 下标稳定语义：
 *  - 返回数组长度 === 入参长度
 *  - 校验失败/异常的元素在对应下标填 null
 */
function upsertMetagBatch(db: DrizzleDBType, list: NewMetagRow[]): void {
    db.transaction((tx) => {
        for (let i = 0; i < list.length; i++) {
            upsertMetagSingle(tx as DrizzleDBType, list[i]);
        }
    });
}

/**
 * 统一入口：单条 or 批量 upsert，始终返回数组
 *
 * 下标语义:
 *  - 传 string / 单对象  → 返回长度 1 的数组
 *  - 传数组             → 返回长度与入参一致，未成功项为 null
 */
export function upcertMetag(
    db: DrizzleDBType,
    m: NewMetagRow | NewMetagRow[]
): void {
    if (Array.isArray(m)) {
        return upsertMetagBatch(db, m);
    } else {
        return upsertMetagSingle(db, m);
    }
}

/* ==============================================================
 *   Query
 * ============================================================== */

function getMetagSingle(db: DrizzleDBType, fieldKey: string): MetagRow | null {
    if (!fieldKey) return null;
    const row = db
        .select()
        .from(metag)
        .where(eq(metag.fieldKey, fieldKey))
        .get();
    return row ?? null;
}

/**
 * 批量查询 —— 下标稳定
 *
 *  - 返回数组长度 === 入参长度
 *  - 未命中 / 空 key，对应位置为 null
 *  - 一次性走 IN 查询避免 N 次 round-trip
 */
function getMetagBatch(db: DrizzleDBType, fieldKeys: string[]): (MetagRow | null)[] {
    if (!fieldKeys || fieldKeys.length === 0) return [];

    // 收集非空 key 去做一次 IN 查询
    const uniqKeys = Array.from(new Set(fieldKeys.filter(Boolean)));
    const hitMap = new Map<string, MetagRow>();

    if (uniqKeys.length > 0) {
        const rows = db
            .select()
            .from(metag)
            .where(inArray(metag.fieldKey, uniqKeys))
            .all();
        for (const row of rows) hitMap.set(row.fieldKey, row);
    }

    // 按原始下标回填
    return fieldKeys.map(k => (k ? hitMap.get(k) ?? null : null));
}

/**
 * 统一入口：单条 or 批量查询，始终返回数组
 *
 * 下标语义:
 *  - 传 string  → 长度 1 的数组，命中为 [row]，未命中为 [null]
 *  - 传 string[] → 长度与入参一致，未命中位置为 null
 */
export function getMetag(db: DrizzleDBType, key: string | string[]): (MetagRow | null)[] {
    if (Array.isArray(key)) {
        return getMetagBatch(db, key);
    }
    return [getMetagSingle(db, key)];
}

/**
 * 列表查询（所有元术语，谨慎使用；一般用于管理台/导出）
 */
export function listAllMetags(db: DrizzleDBType): MetagRow[] {
    return db.select().from(metag).all();
}

/* ==============================================================
 *   Delete
 * ============================================================== */

function deleteMetagSingle(db: DrizzleDBType, fieldKey: string): void {
    if (!fieldKey) return;
    db.delete(metag)
        .where(eq(metag.fieldKey, fieldKey))
        .run()
}

/**
 * 批量删除 —— 下标稳定
 *
 *  - 返回数组长度 === 入参长度
 *  - 未命中位置填 null
 */
function deleteMetagBatch(db: DrizzleDBType, fieldKeys: string[]): void {
    if (!fieldKeys || fieldKeys.length === 0) return;

    const uniqKeys = Array.from(new Set(fieldKeys.filter(Boolean)));

    if (uniqKeys.length > 0) {
        db.delete(metag)
            .where(inArray(metag.fieldKey, uniqKeys))
            .run()
    }
}

/**
 * 统一入口：单条 or 批量删除，始终返回数组
 * 未命中位置为 null，下标严格对齐入参
 */
export function deleteMetag(db: DrizzleDBType, key: string | string[]): void {
    if (Array.isArray(key)) {
        deleteMetagBatch(db, key);
    } else {
        deleteMetagSingle(db, key);
    }
}

/* ==============================================================
 *   Timestamps
 * ============================================================== */

function getMetagTimestampsSingle(db: DrizzleDBType, fieldKey: string): PrjTimeStamps | null {
    if (!fieldKey) return null;
    const row = db
        .select({
            fieldKey: metag.fieldKey,
            createdAt: metag.createdAt,
            updatedAt: metag.updatedAt,
        })
        .from(metag)
        .where(eq(metag.fieldKey, fieldKey))
        .get();
    return row ?? null;
}

/**
 * 批量取时间戳 —— 下标稳定
 */
function getMetagTimestampsBatch(
    db: DrizzleDBType,
    fieldKeys: string[]
): (PrjTimeStamps | null)[] {
    if (!fieldKeys || fieldKeys.length === 0) return [];

    const uniqKeys = Array.from(new Set(fieldKeys.filter(Boolean)));
    const hitMap = new Map<string, PrjTimeStamps>();

    if (uniqKeys.length > 0) {
        const rows = db
            .select({
                fieldKey: metag.fieldKey,
                createdAt: metag.createdAt,
                updatedAt: metag.updatedAt,
            })
            .from(metag)
            .where(inArray(metag.fieldKey, uniqKeys))
            .all();
        for (const row of rows) hitMap.set(row.fieldKey, row);
    }

    return fieldKeys.map(k => (k ? hitMap.get(k) ?? null : null));
}

/**
 * 统一入口：获取 metag 时间戳，始终返回数组，下标稳定
 *
 * 应用场景：
 *  - 校验缓存新鲜度
 *  - 与远端做增量同步（对比 updatedAt）
 *  - 前端展示元术语的最后修改时刻
 */
export function getMetagTimestamps(
    db: DrizzleDBType,
    key: string | string[]
): (PrjTimeStamps | null)[] {
    if (Array.isArray(key)) {
        return getMetagTimestampsBatch(db, key);
    }
    return [getMetagTimestampsSingle(db, key)];
}