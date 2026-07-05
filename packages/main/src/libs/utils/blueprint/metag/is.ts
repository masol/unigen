import { metag } from "$libs/utils/db/schema/metag.js";
import { MetagJson, MetagType } from "$libs/utils/db/schema/metagtype.js";
import Logger from "electron-log/main.js";
import z from "zod";

export type MetagRow = typeof metag.$inferSelect;
export type NewMetagRow = typeof metag.$inferInsert;

/* ==============================================================
 *   脱水 / 注水 辅助函数
 *   (供跨进程 IPC、日志、导入导出等场景使用)
 * ============================================================== */

/**
 * 脱水：MetagType (运行态含 Zod 实例) -> MetagJson (纯 JSON 可序列化)
 *
 * 使用场景：
 *  - 通过 Electron IPC 传给渲染进程
 *  - 导出配置、写入知识库
 *
 * 注意 fieldKey 校验：无 fieldKey 的记录会被拒绝写入（返回 null）。
 */
export function metagToJson(m: MetagType): MetagJson | null {
    if (!m.fieldKey || typeof m.fieldKey !== 'string') {
        Logger.warn('metag2Json: skipped record without fieldKey', m);
        return null;
    }
    const { schema, fieldKey, intent, reducer, storage } = m;
    return {
        fieldKey,
        intent,
        reducer,
        storage,
        schema: schema ? (z.toJSONSchema(schema) as Record<string, unknown>) : undefined,
    };
}

/**
 * 注水：MetagJson (纯 JSON) -> MetagType (含活的 Zod 实例)
 *
 * 使用场景：
 *  - IPC 反序列化
 *  - 从外部 JSON 配置恢复
 *  - 手动 select 出行后二次组装（不走 drizzle customType 时）
 */
export function metagFromJson(j: MetagJson): MetagType | null {
    if (!j || !j.fieldKey) {
        Logger.warn('metagFromJson: skipped record without fieldKey', j);
        return null;
    }
    const { schema, fieldKey, intent, reducer, storage } = j;
    let liveSchema: z.ZodTypeAny | undefined;
    if (schema) {
        try {
            liveSchema = z.fromJSONSchema(schema);
        } catch (e) {
            Logger.error('metagFromJson: failed to rehydrate schema for', fieldKey, e);
            liveSchema = z.any(); // 兜底
        }
    }
    return {
        fieldKey,
        intent,
        reducer,
        storage,
        schema: liveSchema,
    };
}

/** 批量脱水（过滤掉无 fieldKey 的项） */
export function metagList2Json(list: MetagType[]): MetagJson[] {
    return list.map(metagToJson).filter((x): x is MetagJson => x !== null);
}

/** 批量注水（过滤掉无 fieldKey 的项） */
export function metagListFromJson(list: MetagJson[]): MetagType[] {
    return list.map(metagFromJson).filter((x): x is MetagType => x !== null);
}


/* ==============================================================
 *   类型守卫与校验
 * ============================================================== */

/**
 * 判断输入对象是否为有效的 MetagRow 数据库记录
 * 
 * 作用：
 *  - 运行时：检查非空、对象类型以及核心主键 `fieldKey` 是否存在。
 *  - 编译期：使用 `value is MetagRow` 实现 TypeScript 类型收敛（Type Narrowing）。
 */
export function isMetagRow(value: unknown): value is MetagRow {
    if (!value || typeof value !== 'object') {
        return false;
    }

    // 通过 duck typing 检查 Drizzle Schema 中定义的核心必填字段（此处以核心主键 fieldKey 为主）
    const record = value as Record<string, unknown>;

    return typeof record.fieldKey === 'string' && record.fieldKey.trim() !== '';
}