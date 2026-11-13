// packages/main/src/types/shared/api/kb.ts
import { z } from "zod";

export const kbDocStatusSchema = z.enum(["ready", "converting", "failed"]);
export type KbDocStatus = z.infer<typeof kbDocStatusSchema>;

const kbDocFields = {
    name: z.string(),
    /** 文件绝对路径。列表接口返回；upsert 时作为源文件路径。 */
    path: z.string().optional(),
    size: z.number().int().nonnegative().default(0),
    kind: z.string().default(""),
    status: kbDocStatusSchema.default("ready"),
};

export const kbDocSchema = z.object({
    id: z.string(),
    ...kbDocFields,
});
export type KbDoc = z.infer<typeof kbDocSchema>;

export const kbDocInputSchema = z.object({
    /** 新建文件时可由客户端留空，由 loader 生成。 */
    id: z.string().optional(),
    ...kbDocFields,
});
export type KbDocInput = z.infer<typeof kbDocInputSchema>;

export const kbCollectionSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    docs: z.array(kbDocSchema).default([]),
    /** ISO 时间戳，用于卡片底部展示"更新于 X 前"。 */
    updatedAt: z.string(),
    /** 知识库目录绝对路径。 */
    path: z.string().optional(),
});
export type KbCollection = z.infer<typeof kbCollectionSchema>;

export const kbCollectionInputSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().default(""),
    docs: z.array(kbDocInputSchema).default([]),
});
export type KbCollectionInput = z.infer<typeof kbCollectionInputSchema>;

export const knowledgeBaseListOutputSchema = z.array(kbCollectionSchema);

export const knowledgeBaseUpsertInputSchema = kbCollectionInputSchema.extend({
    /** 新建时留空；更新时传列表返回的 id。 */
    id: z.string().trim().optional(),
});
export type KnowledgeBaseUpsertInput = z.infer<
    typeof knowledgeBaseUpsertInputSchema
>;
export const knowledgeBaseUpsertOutputSchema = kbCollectionSchema;

export const knowledgeBaseDeleteInputSchema = z.object({
    id: z.string().trim().min(1),
});
export type KnowledgeBaseDeleteInput = z.infer<
    typeof knowledgeBaseDeleteInputSchema
>;
export const knowledgeBaseDeleteOutputSchema = z.object({
    success: z.boolean(),
});

export const knowledgeBaseInstallInputSchema = z.string().trim().min(1);

export const knowledgeBaseInstallOutputSchema = z.object({
    source: z.string(),
    targetDir: z.string(),
});

export const knowledgeBaseSearchInputSchema = z.object({
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().positive().max(100).default(20),
    offset: z.number().int().nonnegative().default(0),
});

export const knowledgeBaseSearchItemSchema = z.object({
    /** chunk id。 */
    id: z.string(),
    /** 所属知识库 id。 */
    kbId: z.string(),
    /** 所属知识库名称。 */
    kbName: z.string(),
    /** 所属知识库描述。 */
    kbDescription: z.string().default(""),
    /** chunk 正文。 */
    text: z.string(),
    /** chunk 所属文档标题。 */
    title: z.string().default(""),
    /** chunk 来源标识（文件名 / URL 等）。 */
    source: z.string().default(""),
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