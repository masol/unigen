// packages/main/src/types/shared/api/skill.ts
import { z } from "zod";

export const skillSearchItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    path: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    rerankScore: z.number().optional(),
});

// 安装不再接收来源字符串：来源由主进程打开 zip 选择框决定。
export const skillInstallInputSchema = z.void();

export const skillInstallOutputSchema = z.discriminatedUnion("canceled", [
    z.object({
        canceled: z.literal(true),
    }),
    z.object({
        canceled: z.literal(false),
        source: z.string(),
        targetDir: z.string(),
    }),
]);

export const skillSearchInputSchema = z.object({
    query: z.string().trim().max(500).default(""),
    limit: z.number().int().positive().max(100).default(20),
    offset: z.number().int().nonnegative().default(0),
});

export const skillSearchOutputSchema = z.object({
    items: z.array(skillSearchItemSchema),
    hasMore: z.boolean(),
});

export const skillDeleteInputSchema = z.object({
    id: z.string().trim().min(1),
});

export const skillDeleteOutputSchema = z.object({
    success: z.literal(true),
});

export type SkillInstallInput = z.infer<typeof skillInstallInputSchema>;
export type SkillInstallOutput = z.infer<typeof skillInstallOutputSchema>;
export type SkillSearchInput = z.infer<typeof skillSearchInputSchema>;
export type SkillSearchItem = z.infer<typeof skillSearchItemSchema>;
export type SkillSearchOutput = z.infer<typeof skillSearchOutputSchema>;
export type SkillDeleteInput = z.infer<typeof skillDeleteInputSchema>;
export type SkillDeleteOutput = z.infer<typeof skillDeleteOutputSchema>;