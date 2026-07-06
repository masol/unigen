import { z } from 'zod';

// 1. Define the BlueprintKind enum/union
export const BlueprintKindSchema = z.union([
    z.literal('glossary'),
    z.literal('metag'),
    z.literal('capa')
]);

// 2. Define the QueryParams schema
export const QueryParamsSchema = z.object({
    kind: BlueprintKindSchema,
    name: z.string().optional(),
    pageIndex: z.number(),
    pageSize: z.number(),
});

// 3. Infer types from schemas
export type BlueprintKind = z.infer<typeof BlueprintKindSchema>;
export type QueryParams = z.infer<typeof QueryParamsSchema>;


export const ListItemSchema = z.object({
    name: z.string(),
    updatedAt: z.string(),
    on: z.string().nullish().optional(), // 使用optional，兼容所有种类
});
export type ListItem = z.infer<typeof ListItemSchema>;

// 统一的响应体 Schema（不再需要复杂的 union）
export const GetListResponseSchema = z.object({
    total: z.number().nonnegative(),
    pageIndex: z.number().nonnegative(),
    pageSize: z.number().positive(),
    items: z.array(ListItemSchema),
});
export type GetListResponse = z.infer<typeof GetListResponseSchema>;