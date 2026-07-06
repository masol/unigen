import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { type FewShotExample } from './capatype.js';

/**
 * Capabilities 表 (SQLite)
 *
 * 说明:
 * - input/output 现在只存储 fieldKey 字符串数组，具体的 IO Schema 元数据
 *   由 metag 表 (元术语表) 统一管理，通过 fieldKey 关联。
 * - 未在 metag 中登记的 fieldKey 动态创建以此fieldKey的元术语记录，然后 KV 落盘映射。
 */
export const capabilities = sqliteTable('capabilities', {
    // 1. SQLite 没有原生的 uuid 类型和 defaultRandom()
    // 使用 text 作为主键，并通过 $defaultFn 在代码层自动生成 UUIDv4
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),

    // 注意：#开头的名称为内部名称。
    // #inter::后续为名称。 
    // #workflow: code 保存 workflow 定义。 
    // #code::: code 保存 functor 的 run 源码 (依赖注入，无外部引用)。
    name: text('name').notNull().default(""),
    role: text('role').notNull().default(""),
    goal: text('goal').notNull().default(""),
    code: text('code').notNull().default(""),

    // 仅存储 fieldKey 字符串数组
    // 每一项都是 metag 表中的 fieldKey (若存在，则可查到完整的 Schema/Reducer/Storage 定义)
    input: text('input', { mode: 'json' })
        .$type<string[]>()
        .notNull()
        .default(sql`'[]'`),

    output: text('output', { mode: 'json' })
        .$type<string[]>()
        .notNull()
        .default(sql`'[]'`),

    process: text('process').notNull().default(""),
    negative: text('negative').notNull().default(""),
    criteria: text('criteria').notNull().default(""),

    // 3. SQLite 没有 jsonb
    // 同样使用 text 类型的 json 模式，并挂载 FewShotExample[] 类型
    fewshot: text('fewshot', { mode: 'json' })
        .$type<FewShotExample[]>()
        .notNull()
        .default(sql`'[]'`),

    // 创建时间
    createdAt: text('created_at')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`)
        .$defaultFn(() => new Date().toISOString()),

    // 更新时间
    updatedAt: text('updated_at')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`)
        .$defaultFn(() => new Date().toISOString())
        .$onUpdate(() => new Date().toISOString()),
});
