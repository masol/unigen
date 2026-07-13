import { z } from 'zod';

// 数组元素的基础结构(zod允许任意额外的值，并且不会过滤这些额外值)
export const ArrayItemSchema = z.object({
    id: z.string(), // 唯一的会话/实例 ID
    item: z.any().optional(),  // 加载回来的单个item数据，可能是null
}).loose();
export type ArrayItem = z.input<typeof ArrayItemSchema>;