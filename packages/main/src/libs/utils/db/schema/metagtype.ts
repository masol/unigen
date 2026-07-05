import { customType } from 'drizzle-orm/sqlite-core';
import Logger from 'electron-log/renderer';
import { z } from 'zod';


// 控制数据在 KV 中的更新模式
export const ReducerStrategySchema = z.enum([
    'replace', // 覆盖：直接用新值替换旧值
    'merge',   // 合并：Shallow/Deep Merge（默认）
    'append',  // 后补：向数组末尾追加
    'prepend', // 前插：向数组开头插入
]);
export type ReducerStrategy = z.infer<typeof ReducerStrategySchema>;

// 控制空间拓扑（数据在 KV 中怎么存）—— 只针对数组
export const storageModeSchema = z.enum([
    'flatten',  // 扁平模式：拆分为多个小 Key，如 key_{{id}} 散落存储
    'monolith', // 单体模式：所有属性作为子字段，嵌套在唯一大 Key 下
    // 'chained' // @TODO: 需要 immutable 状态存储和回溯查询时支持
]);
export type StorageMode = z.infer<typeof storageModeSchema>;

/**
 * =========================================
 *   Metag —— 元术语表 (Meta-Terminology)
 * =========================================
 *
 * 说明：
 * - metag 定义了系统中所有 IO 字段的元信息，包括 schema/reducer/storage 等。
 * - 术语表 (KV Store) 存储运行时数据；元术语表 (metag) 存储字段的“定义规则”。
 * - 主键为 fieldKey：全局唯一，驼峰/下划线，消歧核心标识。
 * - Capabilities.input/output 中的每个字符串通过 fieldKey 与本表关联。
 *   未登记的 fieldKey 允许存在（首次请求自动以默认参数，加入元术语表，并给出警告）。
 */

/** 运行时 Metag 结构（含活的 Zod 实例） */
export type MetagType = {
    /** 归一化对齐变量名(mustache格式来处理路径中多个数组的情况)，驼峰格式(下划线被作为数组成员分割符)，全局唯一，消歧核心标识 */
    fieldKey: string;
    /** 意图变量，承载意图路由 (Intent Routing) 并映射到 KV Store 中的 fieldKey (mustache 格式) */
    intent?: string;
    /** 可选的 Zod schema，用于验证数据的结构和类型 */
    schema?: z.ZodTypeAny;
    /** 可选的 reducer 策略，处理数据合并或替换逻辑，默认replace */
    reducer?: ReducerStrategy;
    /** 可选的存储模式，控制 KV 中的存储拓扑；如存在，数据一定是数组类型。默认 monolith */
    storage?: StorageMode;
};

/** 已脱水（可持久化 / 可 JSON 序列化）的 Metag */
export type MetagJson = {
    fieldKey: string;
    intent?: string;
    schema?: Record<string, unknown>;
    reducer?: ReducerStrategy;
    storage?: StorageMode;
};

/* ==============================================================
 *   自定义列类型：Zod Schema ⇄ JSON 双向转换 (针对 schema 列)
 * ============================================================== */

/**
 * 单列级 zod-schema 编解码器。
 * - 存储态：JSON Schema 字符串（SQLite TEXT）
 * - 运行态：活的 z.ZodTypeAny 实例
 */
export const zodSchemaJsonType = customType<{
    data: z.ZodTypeAny;
    driverData: string;
}>({
    dataType() {
        return 'text';
    },
    toDriver(value: z.ZodTypeAny): string {
        return JSON.stringify(z.toJSONSchema(value));
    },
    fromDriver(value: string): z.ZodTypeAny {
        try {
            const parsed = JSON.parse(value);
            return z.fromJSONSchema(parsed);
        } catch (e) {
            Logger.error('Failed to parse zodSchemaJsonType from database:', value, e);
            // 兜底返回一个宽松 schema，避免解码失败让整行取不出来
            return z.any();
        }
    },
});