import { z } from "zod";

export const listSessionsParamsSchema = z.object({
    pageIndex: z.number().optional(),
    pageSize: z.number().optional(),
    orderBy: z.enum(["lastMessageAt", "updatedAt", "createdAt"]).optional(),
    orderDir: z.enum(["asc", "desc"]).optional(),
});

export type ListSessionsParams = z.infer<typeof listSessionsParamsSchema>;



/** epoch ms：整数且非负 */
const epochMs = z.number().int().nonnegative();

export const chatSessionSchema = z.object({
    id: z.string().min(1),
    title: z.string(),
    /** 用户是否手动修改过标题；一旦为 true，自动标题逻辑不再触发 */
    titleManual: z.boolean(),
    /** 会话创建时间 epoch ms */
    createdAt: epochMs,
    /** 会话属性最后变更 epoch ms (改标题、消息到达等) */
    updatedAt: epochMs,
    /** 最近一条消息到达时间 epoch ms；用于按活跃度排序 */
    lastMessageAt: epochMs.optional(),
    /** 累计消息数（冗余以免每次扫表） */
    messageCount: z.number().int().nonnegative(),
});

export type ChatSession = z.infer<typeof chatSessionSchema>;