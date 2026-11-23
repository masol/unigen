// packages/main/src/libs/tooldb/tools/extract_archive.ts
import { extractArchive } from "$libs/loader/archive.js";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";
import {
    resolveProjectWritePath,
    resolveReadPath,
    toPreferredPath,
} from "./path-utils.js";

const inputSchema = z.object({
    archive_path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "归档文件路径。优先传相对 项目目录 的路径；绝对路径仅用于 项目目录 外的归档。",
        ),
    target_dir: z
        .string()
        .trim()
        .min(1)
        .default(".")
        .describe(
            "解压目标目录，严格限制在 项目目录 内；默认 '.' 表示 项目目录。",
        ),
    strip_prefix: z
        .string()
        .trim()
        .optional()
        .describe("剥离子路径前缀，例如 'package/'。"),
    strip_components: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("按层数剥离，优先于 strip_prefix。"),
    allow_symlinks: z
        .boolean()
        .default(false)
        .describe("是否允许解压 tar 归档中的符号链接。默认 false。"),
});

const outputSchema = z.object({
    archivePath: z.string(),
    archiveAbsolutePath: z.string(),
    targetDir: z.string(),
    targetAbsolutePath: z.string(),
    entryCount: z.number().int().nonnegative(),
    totalBytes: z.number().nonnegative(),
});

export type ExtractArchiveInput = z.infer<typeof inputSchema>;
export type ExtractArchiveOutput = z.infer<typeof outputSchema>;

export const extractArchiveTool: ToolDefinition<
    ExtractArchiveInput,
    ExtractArchiveOutput
> = {
    name: "extract_archive",
    description:
        "解压 zip/tar/tar.gz/tgz/tar.bz2 归档到 项目目录 内。**cwd 是项目目录**：" +
        "archive_path 优先传相对 项目目录 路径；target_dir 必须是 项目目录 内路径。" +
        "支持 strip_prefix / strip_components 去除顶层目录。" +
        "返回解压条目数和总字节数。",
    inputSchema,
    outputSchema,
    execute: async ({
        archive_path,
        target_dir,
        strip_prefix,
        strip_components,
        allow_symlinks,
    }) => {
        const archiveAbs = resolveReadPath(archive_path);
        const targetAbs = resolveProjectWritePath(target_dir, {
            allowRoot: true,
        });

        let entryCount = 0;
        let totalBytes = 0;

        await extractArchive({
            archivePath: archiveAbs,
            targetDir: targetAbs,
            ...(strip_prefix ? { stripPrefix: strip_prefix } : {}),
            ...(strip_components != null
                ? { stripComponents: strip_components }
                : {}),
            allowSymlinks: allow_symlinks,
            onEntry: (_relativePath, bytes) => {
                entryCount += 1;
                totalBytes += bytes ?? 0;
            },
        });

        return {
            archivePath: toPreferredPath(archiveAbs),
            archiveAbsolutePath: archiveAbs,
            targetDir: toPreferredPath(targetAbs),
            targetAbsolutePath: targetAbs,
            entryCount,
            totalBytes,
        };
    },
};