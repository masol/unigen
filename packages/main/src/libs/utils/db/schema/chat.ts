// packages/main/src/libs/utils/db/schema/chat.ts
//
// Sessions / Messages / Traces 三表
//
// 设计要点:
//   - 时间列统一使用 INTEGER (epoch ms)。
//   - FK 声明保留；运行期 foreign_keys = OFF，故 drizzle/chat.ts 内部对删除做手工级联。
//   - trace 行独立持久化：仅通过 (id, parent_id) 关联，适合流式增量写入。
//     parent 可能先于 child 不存在，读取时需容错 (在应用层挂到根)。
//   - trace 的 kind 专属字段合并到 `extra` JSON 列，避免宽稀疏表。
//   - trace 行入库顺序通过 `created_at` 维持，无需额外 orderIndex。
//   - sessions.titleManual 标志用户是否手动改过标题，自动改题逻辑读它决定是否覆盖。

import type { AgentIdentity } from "$types/shared/chat.js";
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        title: text('title').notNull().default(''),
        /** 用户手动改题后置 1，自动标题逻辑此后不再触发 */
        titleManual: integer('title_manual', { mode: 'boolean' })
            .notNull()
            .default(false),
        createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
        updatedAt: integer('updated_at')
            .notNull()
            .$defaultFn(() => Date.now())
            .$onUpdate(() => Date.now()),
        lastMessageAt: integer('last_message_at'),
        messageCount: integer('message_count').notNull().default(0),
    },
    (table) => [
        index('idx_sessions_updated_at').on(table.updatedAt),
        index('idx_sessions_last_message_at').on(table.lastMessageAt),
    ]
);

export const messages = sqliteTable(
    'messages',
    {
        id: text('id').primaryKey(),
        sessionId: text('session_id')
            .notNull()
            .references(() => sessions.id, { onDelete: 'cascade' }),
        role: text('role', { enum: ['user', 'assistant'] }).notNull(),
        content: text('content').notNull().default(''),
        isError: integer('is_error', { mode: 'boolean' }).notNull().default(false),
        /** 助手消息的 agent 身份；user 消息为 null */
        agent: text('agent', { mode: 'json' }).$type<AgentIdentity | null>(),
        /** 相对项目根目录的文件路径数组，JSON 存储 */
        files: text('files', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
        /** 消息模式：null (默认，参与历史) 或 "cmd" (不参与历史) */
        mode: text('mode', { enum: ['cmd'] }),
        /** epoch ms；会话内自然排序键 */
        timestamp: integer('timestamp').notNull(),
    },
    (table) => [
        index('idx_messages_session_id').on(table.sessionId),
        index('idx_messages_timestamp').on(table.timestamp),
        index('idx_messages_session_ts').on(table.sessionId, table.timestamp),
        index('idx_messages_session_mode').on(table.sessionId, table.mode)
    ]
);

/**
 * trace 行的 kind 专属 payload，JSON 存入 `extra` 列。
 * 读取时根据 kind 做类型收窄。
 */
export type TraceExtra =
    | { kind: "agent"; agent: AgentIdentity }
    | { kind: "reasoning" }
    | { kind: "tool"; toolName: string; errorText?: string }
    | { kind: "source"; url: string }
    | { kind: "step"; icon?: string }
    | { kind: "input" }
    | { kind: "output" };

export const traces = sqliteTable(
    'traces',
    {
        /** trace 节点 ID 来自主进程事件，必须稳定（支持幂等重写） */
        id: text('id').primaryKey(),
        messageId: text('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        /** 根节点为 null；嵌套节点挂到父 agent 节点。
         *  parent 允许暂时不存在（流式写入时序允许父后到），读取时容错挂根 */
        parentId: text('parent_id'),
        kind: text('kind', {
            enum: ['agent', 'reasoning', 'tool', 'source', 'step', 'input', 'output'],
        }).notNull(),
        status: text('status', {
            enum: ['pending', 'running', 'success', 'error'],
        }).notNull(),
        title: text('title').notNull().default(''),
        description: text('description'),
        detail: text('detail'),
        startedAt: integer('started_at'),
        finishedAt: integer('finished_at'),
        /** 行入库时间 (epoch ms)。
         *  首次 upsert 时写入，之后不再变更，用作兄弟节点的稳定排序键 */
        createdAt: integer('created_at').notNull().default(sql`0`),
        extra: text('extra', { mode: 'json' }).$type<TraceExtra | null>(),
    },
    (table) => [
        index('idx_traces_message_id').on(table.messageId),
        index('idx_traces_message_parent').on(table.messageId, table.parentId),
        index('idx_traces_message_created').on(table.messageId, table.createdAt),
    ]
);