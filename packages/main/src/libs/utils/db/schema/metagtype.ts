import { customType } from 'drizzle-orm/sqlite-core';
import Logger from 'electron-log/main.js';
import { z } from 'zod';


// 控制数据在 KV 中的更新模式
export const ReducerStrategySchema = z.enum([
    'replace', // 覆盖：直接用新值替换旧值（默认）
    'merge',   // 合并：Shallow/Deep Merge
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