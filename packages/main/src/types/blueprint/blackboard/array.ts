import { z } from 'zod';

export const ArrayDataSchema = z.object({
    data: z.any(), // 用户存储的实际数据。
    updatedAt: z.string().nullable(), // 数据更新时间戳
});
export type ArrayData = z.input<typeof ArrayDataSchema>;


// 数组元素的基础结构
export const ArrayItemSchema = z.object({
    id: z.string(), // 唯一的会话/实例 ID
    item: z.any().optional(),  // 加载回来的单个item数据，可能是null
});
export type ArrayItem = z.input<typeof ArrayItemSchema>;