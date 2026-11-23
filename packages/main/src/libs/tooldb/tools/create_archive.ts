// packages/main/src/libs/tooldb/tools/create_archive.ts
import { detectArchiveKind } from "$libs/loader/archive.js";
import AdmZip from "adm-zip";
import { promises as fs } from "node:fs";
import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
    sep,
} from "node:path";
import * as tar from "tar";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";
import {
    resolveProjectWritePath,
    resolveReadPath,
    toPreferredPath,
} from "./path-utils.js";

const inputSchema = z.object({
    source_path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要压缩的文件或目录。优先传相对 项目目录 的路径；绝对路径仅用于 项目目录 外。",
        ),
    output_path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "归档输出路径，严格限制在 项目目录 内。扩展名决定格式：.zip / .tar / .tar.gz / .tgz。",
        ),
});

const outputSchema = z.object({
    sourcePath: z.string(),
    sourceAbsolutePath: z.string(),
    outputPath: z.string(),
    outputAbsolutePath: z.string(),
    kind: z.enum(["zip", "tar", "tar.gz", "tgz"]),
    entryCount: z.number().int().nonnegative(),
    size: z.number().nonnegative(),
});

export type CreateArchiveInput = z.infer<typeof inputSchema>;
export type CreateArchiveOutput = z.infer<typeof outputSchema>;

export const createArchiveTool: ToolDefinition<
    CreateArchiveInput,
    CreateArchiveOutput
> = {
    name: "create_archive",
    description:
        "创建 zip/tar/tar.gz/tgz 压缩归档。**cwd 是项目目录**：" +
        "source_path 优先传相对 项目目录 的路径；output_path 必须位于 项目目录 内，扩展名决定格式。" +
        "暂不支持创建 .tar.bz2。",
    inputSchema,
    outputSchema,
    execute: async ({ source_path, output_path }) => {
        const sourceAbs = resolveReadPath(source_path);
        const outputAbs = resolveProjectWritePath(output_path);

        const kind = detectArchiveKind(outputAbs);
        if (
            kind === "unsupported" ||
            kind === "tar.bz2" ||
            kind === "bz2"
        ) {
            throw new Error(
                `不支持的归档格式：${output_path}。` +
                `创建归档支持 .zip / .tar / .tar.gz / .tgz。`,
            );
        }

        if (sourceAbs === outputAbs) {
            throw new Error("输出路径不能与源文件相同。");
        }

        const srcStat = await fs.stat(sourceAbs);
        if (srcStat.isDirectory()) {
            const rel = relative(sourceAbs, outputAbs);
            if (
                rel === "" ||
                (!rel.startsWith(`..${sep}`) && !isAbsolute(rel))
            ) {
                throw new Error(
                    `归档输出文件不能位于源目录内部: ${output_path}`,
                );
            }
        }

        await fs.mkdir(dirname(outputAbs), { recursive: true });

        let entryCount = 0;
        const safeKind = kind as "zip" | "tar" | "tar.gz" | "tgz";

        if (safeKind === "zip") {
            const zip = new AdmZip();
            if (srcStat.isDirectory()) {
                zip.addLocalFolder(sourceAbs, "");
            } else {
                zip.addLocalFile(sourceAbs, "");
            }
            const bytes = zip.toBuffer();
            await fs.writeFile(outputAbs, bytes);
            entryCount = zip.getEntries().length;
        } else {
            const gzip = safeKind === "tar.gz" || safeKind === "tgz";
            const cwd = srcStat.isDirectory()
                ? sourceAbs
                : dirname(sourceAbs);
            const entries = srcStat.isDirectory()
                ? ["."]
                : [basename(sourceAbs)];

            await tar.c(
                {
                    file: outputAbs,
                    cwd,
                    gzip,
                    filter: (entryPath: string) => {
                        if (join(cwd, entryPath) === outputAbs) {
                            return false;
                        }
                        entryCount += 1;
                        return true;
                    },
                },
                entries,
            );

            if (entryCount === 0) {
                throw new Error(
                    `归档内没有可压缩文件：${source_path}`,
                );
            }
        }

        const finalStat = await fs.stat(outputAbs);

        return {
            sourcePath: toPreferredPath(sourceAbs),
            sourceAbsolutePath: sourceAbs,
            outputPath: toPreferredPath(outputAbs),
            outputAbsolutePath: outputAbs,
            kind: safeKind,
            entryCount,
            size: finalStat.size,
        };
    },
};