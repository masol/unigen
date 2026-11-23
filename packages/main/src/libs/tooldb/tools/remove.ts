// packages/main/src/libs/tooldb/tools/remove.ts
import { lstat, rm } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";
import {
    resolveProjectWritePath,
    toPreferredPath,
} from "./path-utils.js";

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要删除的文件或目录路径。严格限制在 项目目录 内：优先传相对 项目目录 路径；" +
            "绝对路径必须位于 项目目录 内。禁止删除 项目目录 根。",
        ),
    recursive: z
        .boolean()
        .default(false)
        .describe(
            "是否递归删除目录。默认 false，只允许删除文件/空目录；" +
            "删除非空目录必须显式传 true。",
        ),
});

const outputSchema = z.object({
    path: z.string().describe("被删除路径；项目目录 内显示相对 项目目录 路径。"),
    absolutePath: z.string(),
    type: z.enum(["file", "directory", "symlink", "other"]),
    recursive: z.boolean(),
});

export type RemoveInput = z.infer<typeof inputSchema>;
export type RemoveOutput = z.infer<typeof outputSchema>;

export const removeTool: ToolDefinition<RemoveInput, RemoveOutput> = {
    name: "remove",
    description:
        "删除 项目目录 内的文件或目录。**cwd 是项目目录**：path 优先传相对 项目目录 路径；" +
        "绝对路径必须位于 项目目录 内，且禁止删除 项目目录 根。" +
        "默认只删除文件/空目录；删除非空目录必须显式 recursive=true。",
    inputSchema,
    outputSchema,
    execute: async ({ path, recursive }) => {
        const target = resolveProjectWritePath(path);
        const stat = await lstat(target);

        const type: "file" | "directory" | "symlink" | "other" =
            stat.isDirectory()
                ? "directory"
                : stat.isFile()
                    ? "file"
                    : stat.isSymbolicLink()
                        ? "symlink"
                        : "other";

        if (stat.isDirectory()) {
            if (!recursive) {
                throw new Error(
                    "目标是目录。删除目录（或非空目录）必须显式传 recursive=true。",
                );
            }
            await rm(target, {
                recursive: true,
                force: false,
                maxRetries: 2,
            });
        } else {
            await rm(target, { force: false });
        }

        return {
            path: toPreferredPath(target),
            absolutePath: target,
            type,
            recursive,
        };
    },
};