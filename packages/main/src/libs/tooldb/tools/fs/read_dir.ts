// packages/main/src/libs/tooldb/tools/read_dir.ts
import fg, { type Entry } from "fast-glob";
import { promises as fs } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import { resolveReadPath, toPreferredPath } from "../path-utils.js";

const entrySchema = z.object({
    name: z.string(),
    path: z
        .string()
        .describe("后续工具优先使用的路径：项目目录 内为相对 项目目录 路径，项目目录 外为绝对路径。"),
    absolutePath: z.string(),
    type: z.enum(["file", "directory", "symlink", "other"]),
    size: z.number().nonnegative().optional(),
    mtimeMs: z.number().optional(),
});

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .default(".")
        .describe(
            "要读取的目录。优先传相对 项目目录 的路径；默认 `.` 表示 项目目录。" +
            "绝对路径仅在读取 项目目录 外目录时使用。",
        ),
    pattern: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
            "可选 fast-glob 模式，相对 path 解析。省略时只列一级（等价 `*`）；" +
            "需要多级时显式使用 fast-glob 语法，例如 `**/*.ts`、`src/**/*.{js,ts}`。" +
            "不能是绝对路径。",
        ),
    includeHidden: z
        .boolean()
        .default(false)
        .describe("是否包含点文件/点目录。默认 false。"),
    limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(200)
        .describe("最多返回条目数，默认 200，最大 1000。"),
});

const outputSchema = z.object({
    path: z.string().describe("目录路径；项目目录 内显示相对 项目目录 路径。"),
    absolutePath: z.string(),
    pattern: z.string().describe("实际使用的 fast-glob 模式。"),
    includeHidden: z.boolean(),
    matchedCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    entries: z.array(entrySchema),
});

export type ReadDirInput = z.infer<typeof inputSchema>;
export type ReadDirOutput = z.infer<typeof outputSchema>;

export const readDirTool: ToolDefinition<ReadDirInput, ReadDirOutput> = {
    name: "read_dir",
    description:
        "读取目录信息，统一支持 fast-glob 搜索。**cwd 是项目目录**：" +
        "path 优先传相对项目目录的路径。省略 pattern 时只读一级；需要多级时传 fast-glob 模式，" +
        "例如 `**/*.ts`、`src/**/*.{js,ts}`。返回条目含优先路径、绝对路径、类型、大小与 mtime。" +
        "默认不包含隐藏项；limit 控制最大返回数。",
    inputSchema,
    outputSchema,
    execute: async ({ path, pattern, includeHidden, limit }) => {
        const baseAbs = resolveReadPath(path);
        const stat = await fs.stat(baseAbs);
        if (!stat.isDirectory()) {
            throw new Error(`不是目录: ${baseAbs}`);
        }

        const globPattern = pattern?.trim() || "*";
        if (isAbsolute(globPattern)) {
            throw new Error(
                "pattern 必须是相对 path 的 fast-glob 模式，不能是绝对路径。",
            );
        }

        const rawEntries = (await fg(globPattern, {
            cwd: baseAbs,
            onlyFiles: false,
            dot: includeHidden,
            stats: true,
            unique: true,
            followSymbolicLinks: false,
            absolute: false,
            suppressErrors: false,
        })) as Entry[];

        const sorted = rawEntries
            .slice()
            .sort((a, b) => a.path.localeCompare(b.path));

        const truncated = sorted.length > limit;
        const selected = sorted.slice(0, limit);

        const entries = selected.map((entry) => {
            const absPath = resolve(baseAbs, entry.path);
            const dirent = entry.dirent;

            let type: "file" | "directory" | "symlink" | "other" = "other";
            if (dirent?.isSymbolicLink()) {
                type = "symlink";
            } else if (dirent?.isDirectory()) {
                type = "directory";
            } else if (dirent?.isFile()) {
                type = "file";
            }

            return {
                name: entry.name,
                path: toPreferredPath(absPath),
                absolutePath: absPath,
                type,
                ...(entry.stats?.size !== undefined
                    ? { size: entry.stats.size }
                    : {}),
                ...(entry.stats?.mtimeMs !== undefined
                    ? { mtimeMs: entry.stats.mtimeMs }
                    : {}),
            };
        });

        return {
            path: toPreferredPath(baseAbs),
            absolutePath: baseAbs,
            pattern: globPattern,
            includeHidden,
            matchedCount: sorted.length,
            truncated,
            entries,
        };
    },
};