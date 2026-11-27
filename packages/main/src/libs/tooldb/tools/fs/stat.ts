// packages/main/src/libs/tooldb/tools/stat.ts
import { lstat, readlink, realpath } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import { resolveReadPath, toPreferredPath } from "../path-utils.js";

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要查看的文件或目录路径。优先传相对 项目目录 的路径；" +
            "绝对路径仅在路径位于 项目目录 外时使用。",
        ),
});

const outputSchema = z.object({
    path: z.string().describe("项目目录 内显示相对 项目目录 的路径。"),
    absolutePath: z.string(),
    type: z.enum(["file", "directory", "symlink", "other"]),
    size: z.number().nonnegative().describe("lstat 的大小（字节）。"),
    mode: z.number().int().nonnegative().describe("完整 st_mode。"),
    permissions: z.string().describe("八进制权限字符串，例如 755。"),
    mtimeMs: z.number().nonnegative(),
    birthtimeMs: z.number().nonnegative().optional(),
    isSymbolicLink: z.boolean(),
    linkTarget: z.string().optional().describe("符号链接目标；非符号链接时省略。"),
    realPath: z.string().nullable().describe("解析后的真实路径；无法解析时为 null。"),
});

export type StatInput = z.infer<typeof inputSchema>;
export type StatOutput = z.infer<typeof outputSchema>;

export const statTool: ToolDefinition<StatInput, StatOutput> = {
    name: "stat",
    description:
        "查看单个文件/目录的元信息：类型、大小、权限、mtime、是否符号链接、真实路径等。" +
        "**cwd 是项目目录**：path 优先传相对 项目目录 的路径。",
    inputSchema,
    outputSchema,
    execute: async ({ path }) => {
        const absPath = resolveReadPath(path);
        const st = await lstat(absPath);

        let real: string | null;
        try {
            real = await realpath(absPath);
        } catch {
            real = null;
        }

        let linkTarget: string | undefined;
        if (st.isSymbolicLink()) {
            try {
                linkTarget = await readlink(absPath);
            } catch {
                // 忽略，保持 undefined
            }
        }

        const type: "file" | "directory" | "symlink" | "other" =
            st.isDirectory()
                ? "directory"
                : st.isFile()
                    ? "file"
                    : st.isSymbolicLink()
                        ? "symlink"
                        : "other";

        return {
            path: toPreferredPath(absPath),
            absolutePath: absPath,
            type,
            size: st.size,
            mode: st.mode,
            permissions: (st.mode & 0o777).toString(8),
            mtimeMs: st.mtimeMs,
            ...(st.birthtimeMs !== undefined
                ? { birthtimeMs: st.birthtimeMs }
                : {}),
            isSymbolicLink: st.isSymbolicLink(),
            ...(linkTarget ? { linkTarget } : {}),
            realPath: real,
        };
    },
};