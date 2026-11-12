// packages/main/src/types/shared/api/kb.ts
import { z } from "zod";

export const knowledgeBaseInstallInputSchema = z.string().trim().min(1);

export const knowledgeBaseInstallOutputSchema = z.object({
    source: z.string(),
    targetDir: z.string(),
});

export const knowledgeBaseSearchInputSchema = z.object({
    query: z.string().trim().max(500).default(""),
    limit: z.number().int().positive().max(100).default(20),
    offset: z.number().int().nonnegative().default(0),
});

export const knowledgeBaseSearchItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    rerankScore: z.number().optional(),
});

export const knowledgeBaseSearchOutputSchema = z.object({
    items: z.array(knowledgeBaseSearchItemSchema),
    hasMore: z.boolean(),
});

export type KnowledgeBaseInstallInput = z.infer<
    typeof knowledgeBaseInstallInputSchema
>;
export type KnowledgeBaseInstallOutput = z.infer<
    typeof knowledgeBaseInstallOutputSchema
>;
export type KnowledgeBaseSearchInput = z.infer<
    typeof knowledgeBaseSearchInputSchema
>;
export type KnowledgeBaseSearchItem = z.infer<
    typeof knowledgeBaseSearchItemSchema
>;
export type KnowledgeBaseSearchOutput = z.infer<
    typeof knowledgeBaseSearchOutputSchema
>;