import { z } from 'zod';

export const recentProjectSchema = z.object({
    path: z.string(),
    time: z.number(),
    icon: z.string(),
});

// 顺便帮你把类型也推导出来，这样就不用手写两遍了
export type RecentProject = z.infer<typeof recentProjectSchema>;