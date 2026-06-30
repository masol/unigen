import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const kvStore = sqliteTable('kv_store', {
    key: text('key').primaryKey(),

    value: text('value', { mode: 'json' })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .$type<Record<string, any> | any[] | string | number | boolean>()
        .notNull(),

    updatedAt: text('updated_at')
        // 数据库层默认值，迁移复制旧数据自动填充，解决 __new_kv_store 插入报错
        .default(sql`CURRENT_TIMESTAMP`)
        .$defaultFn(() => new Date().toISOString())
        .$onUpdate(() => new Date().toISOString()),
});