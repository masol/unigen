import { z } from "zod";

/**
 * PAC 文件树节点。
 *
 * 单一真源：主进程（loader / api）与渲染进程（file.types / file.store）
 * 共用该类型。
 *
 * 客户端只应通过 `import type` 引入类型；Vite/esbuild 会把 type-only
 * import 完全擦除，因此 zod 不会进入渲染进程 bundle。
 */

const pacNodeBaseSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["file", "folder"]),
    path: z.string(),
    updatedAt: z.number().optional(),
});

// 递归字段 children 需要类型前置（z.lazy 的限制），
// 其它字段全部走 z.infer，避免重复手写。
export type PacNode = z.infer<typeof pacNodeBaseSchema> & {
    children?: PacNode[];
};

export const pacNodeSchema: z.ZodType<PacNode> = pacNodeBaseSchema.extend({
    children: z.lazy(() => pacNodeSchema.array()).optional(),
});

/**
 * PAC 文件文档：front-matter (meta) + 正文。
 *
 * 打开 / 保存接口均返回或接收该结构。
 */
export const pacFileDocumentSchema = z.object({
    path: z.string(),
    meta: z.record(z.string(), z.unknown()),
    content: z.string(),
    updatedAt: z.number().optional(),
});

export type PacFileDocument = z.infer<typeof pacFileDocumentSchema>;