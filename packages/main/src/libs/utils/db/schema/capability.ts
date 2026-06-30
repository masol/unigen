import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { FewShotExample } from './capahelper.js';

/**
 * 2. 定义 Drizzle ORM Schema (SQLite 兼容版本)
 */
export const capabilities = sqliteTable('capabilities', {
    // 1. SQLite 没有原生的 uuid 类型和 defaultRandom()
    // 使用 text 作为主键，并通过 $defaultFn 在代码层自动生成 UUIDv4
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),

    // name如果以#inter::开头，后续为名称。如果是#workflow,则process中保存的内容为workflow定义。注意：#开头的名称为内部名称。
    name: text('name').notNull().default(""),
    role: text('role').notNull().default(""),
    goal: text('goal').notNull().default(""),

    // 2. SQLite 不支持原生 Array（文本数组）
    // 最佳实践：使用 text 类型的 json 模式模拟，并指定 TypeScript 泛型
    // 注意：SQLite 的默认值需要传入安全的 JSON 字符串字符串 '[]'
    input: text('input', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    output: text('output', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    process: text('process', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    negative: text('negative', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    criteria: text('criteria', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),

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
