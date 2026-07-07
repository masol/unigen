/* eslint-disable @typescript-eslint/no-explicit-any */
import * as schema from '$libs/utils/db/schema/index.js';
import { BlueprintKind, GetListResponse, ListItem, QueryParams } from '$types/shared/api/list.js';
import { asc, like, sql } from 'drizzle-orm';
import { DrizzleDBType } from './type.js';

// 1. 定义每个 Kind 返回的 Items 差异化类型
export type ItemTypeMap = {
    glossary: typeof schema.kvStore;
    metag: typeof schema.metag;
    capa: typeof schema.capabilities;
};

// 3. 动态配置映射表（运行时核心逻辑）
// 每一个 kind 都明确它用哪个表、按哪一列过滤、选择哪几列
const KIND_CONFIG = {
    glossary: {
        table: schema.kvStore,
        filterColumn: schema.kvStore.key,
        selectFields: {
            name: schema.kvStore.key,
            updatedAt: schema.kvStore.updatedAt,
        },
    },
    metag: {
        table: schema.metag,
        filterColumn: schema.metag.fieldKey,
        selectFields: {
            name: schema.metag.fieldKey,
            updatedAt: schema.metag.updatedAt,
        },
    },
    capa: {
        table: schema.capabilities,
        filterColumn: schema.capabilities.id,
        selectFields: {
            name: schema.capabilities.id,
            updatedAt: schema.capabilities.updatedAt,
            on: schema.capabilities.name, // 多选一个字段
        },
    },
} as const; // 使用 as const 锁定字面量类型

// 4. 泛型动态查询函数
export function getList<K extends BlueprintKind>(db: DrizzleDBType, { name, pageIndex, pageSize, kind }: QueryParams & { kind: K }): GetListResponse {

    const offset = (pageIndex) * pageSize;

    // 从映射表中取出当前 kind 对应的 Drizzle 配置
    const config = KIND_CONFIG[kind];
    const table = config.table;
    const filterColumn = config.filterColumn;
    const selectFields = config.selectFields;

    // 构建前缀匹配条件（完美的 B-Tree 索引）
    const filterCondition = name ? like(filterColumn, `${name}%`) : undefined;

    // 1. 同步查询符合前缀的总数
    const totalResult = db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(filterCondition)
        .all();

    // 2. 同步查询分页列表（使用强类型的 selectFields）
    // 必须使用 as any 转义 Drizzle 复杂的内部泛型结构，但对外返回我们通过 ItemTypeMap[K] 保持强类型
    const items = db
        .select(selectFields as any)
        .from(table)
        .where(filterCondition)
        .orderBy(asc(filterColumn))
        .limit(pageSize)
        .offset(offset)
        .all() as ListItem[];

    const total = totalResult[0]?.count ?? 0;

    return {
        total,
        items, // 这里的 items 会根据传入的 kind 自动推导为对应的结构
        pageIndex,
        pageSize,
    };
}
