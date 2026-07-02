// @deprecated 2026-07-02: 暂不支持任务持久化。依赖变量更新检查来控制是否需要执行。


// import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
// import { sql } from 'drizzle-orm';


// // workflow的数据，全部扁平化处理。例如 users[0].profile.name  需要扁平化为users_0_profile_name.
// // 整体被视为一个frame(表达一次workflow自演化)
// export const execFrame = sqliteTable('exec_frame', {
//     key: text('key').notNull(),
//     value: text('value', { mode: 'json' })
//         // eslint-disable-next-line @typescript-eslint/no-explicit-any
//         .$type<Record<string, any> | any[] | string | number | boolean>()
//         .notNull(),
//     // 维护工作流演化--frame变动，不同的schema。
//     wfVersion: integer('wf_version').notNull().default(1),

//     version: integer('version').notNull().default(1),
//     // 维护数据层变动。
//     deps: text('deps', { mode: 'json' })
//         .notNull()
//         .default('{}'),

//     /**
//      *  PENDING	key 已生成，但 value 未填充
//      *  READY	value 已成功计算，可用
//      *  FAILED	计算失败 / 无法生成 value
//      */
//     status: text('status', { enum: ['PENDING', 'READY', 'FAILED'] })
//         .notNull()
//         .default('PENDING'),

//     updatedAt: text('updated_at').notNull()
//         .default(sql`CURRENT_TIMESTAMP`)
//         .$defaultFn(() => new Date().toISOString())
//         .$onUpdate(() => new Date().toISOString()),
// },
//     (table) => [
//         // =====================================================
//         // PRIMARY KEY (wfVersion is part of execution namespace)
//         // =====================================================
//         primaryKey({
//             columns: [table.wfVersion, table.key],
//         }),

//         // =====================================================
//         // INDEXES
//         // =====================================================

//         // query full workflow execution state
//         index('idx_execframe_wf_version').on(table.wfVersion),

//         // debug / cross-version analysis
//         index('idx_execframe_key').on(table.key),

//         // runtime version tracking
//         index('idx_execframe_version').on(table.version),
//     ]
// );