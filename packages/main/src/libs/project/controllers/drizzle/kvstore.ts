// packages/main/src/libs/project/controllers/drizzle/kvstore.ts
//
// 纯函数式的 KV 操作，从 PrjDB 中抽离。
// 订阅/通知状态仍留在 PrjDB，由 facade 层组合调用。

import { kvStore } from '$libs/utils/db/schema/index.js';
import type { PrjTimeStore } from '$types/prjstore.js';
import { eq, inArray, sql } from 'drizzle-orm';
import type { DrizzleDBType } from './type.js';

/* ──────────── Write ──────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setKV(db: DrizzleDBType, key: string, value: any): void {
    const now = new Date().toISOString(); // 统一 ISO/UTC
    db.insert(kvStore)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
            target: kvStore.key,
            set: { value, updatedAt: now },
        })
        .run();
}

export function removeKV(db: DrizzleDBType, key: string): void {
    db.delete(kvStore).where(eq(kvStore.key, key)).run();
}

export function removeKVByGlob(db: DrizzleDBType, pattern: string): void {
    db.delete(kvStore).where(sql`${kvStore.key} GLOB ${pattern}`).run();
}

/* ──────────── Read ──────────── */

export function getKV<T>(db: DrizzleDBType, key: string): T | null {
    const r = db
        .select({ value: kvStore.value })
        .from(kvStore)
        .where(eq(kvStore.key, key))
        .get();
    return r ? (r.value as T) : null;
}

export function getKVWithTime<T>(
    db: DrizzleDBType,
    key: string
): PrjTimeStore<T> | null {
    const r = db
        .select({ value: kvStore.value, updatedAt: kvStore.updatedAt })
        .from(kvStore)
        .where(eq(kvStore.key, key))
        .get();
    return r
        ? ({ value: r.value as T, updatedAt: r.updatedAt as string })
        : null;
}

export function getKVsByGlob(db: DrizzleDBType, pattern: string): string[] {
    const rows = db
        .select({ key: kvStore.key })
        .from(kvStore)
        .where(sql`${kvStore.key} GLOB ${pattern}`)
        .all();
    return rows.map((r) => r.key);
}

export function getKVUpdTime(db: DrizzleDBType, key: string): string | null;
export function getKVUpdTime(
    db: DrizzleDBType,
    key: string[]
): Record<string, string>;
export function getKVUpdTime(
    db: DrizzleDBType,
    key: string | string[]
): string | null | Record<string, string> {
    if (Array.isArray(key)) {
        if (key.length === 0) return {};
        const results = db
            .select({ key: kvStore.key, updatedAt: kvStore.updatedAt })
            .from(kvStore)
            .where(inArray(kvStore.key, key))
            .all();
        return results.reduce((acc, row) => {
            if (row.updatedAt) acc[row.key] = row.updatedAt;
            return acc;
        }, {} as Record<string, string>);
    }
    const r = db
        .select({ updatedAt: kvStore.updatedAt })
        .from(kvStore)
        .where(eq(kvStore.key, key))
        .get();
    return r?.updatedAt || null;
}