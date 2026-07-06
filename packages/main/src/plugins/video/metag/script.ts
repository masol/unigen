import { z } from "zod";
import { ArrayItemSchema } from "../../../types/blueprint/blackboard/array.js";

// 基础状态：所有多 Agent 会话的始祖
export const ScriptItemSchema = ArrayItemSchema.extend({
    size: z.number().int().nonnegative(), // 脚本大小
    updatedAt: z.number().int().nonnegative(), // 脚本更新时间，本机运行，不需要时区信息。
});
export type ScriptItem = z.input<typeof ScriptItemSchema>;


export const ParaItemSchema = ArrayItemSchema.extend({
    index: z.number(),            // 0-based 原始顺序
    text: z.string(),
    ests: z.number(),       // token 估算值，用于批次分组
});
export type ParaItem = z.input<typeof ParaItemSchema>;