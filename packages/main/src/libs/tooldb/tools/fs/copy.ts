// packages/main/src/libs/tooldb/tools/copy.ts
import { cp, lstat, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import {
    resolveProjectWritePath,
    resolveReadPath,
    toPreferredPath,
} from "../path-utils.js";

const inputSchema = z.object({
    source: z
        .string()
        .trim()
        .min(1)
        .describe(
            "源路径。优先传相对 项目目录 的路径；只有读取 项目目录 外内容时才建议传绝对路径。" +
            "源为目录时会自动递归拷贝。",
        ),
    destination: z
        .string()
        .trim()
        .min(1)
        .describe(
            "目标路径。严格限制在 项目目录 内：优先传相对 项目目录 路径；" +
            "绝对路径必须位于 项目目录 内。禁止 `..` 逃逸 项目目录。",
        ),
    overwrite: z
        .boolean()
        .default(true)
        .describe(
            "目标已存在时是否覆盖/合并。默认 true；false 时目标已存在会直接报错。",
        ),
    move: z
        .boolean()
        .default(false)
        .describe(
            "true 时移动/重命名：拷贝成功后删除源。默认为 false（纯拷贝）。",
        ),
});

const outputSchema = z.object({
    source: z.string().describe("源路径；项目目录 内显示相对路径，项目目录 外显示绝对路径。"),
    sourceAbsolutePath: z.string(),
    destination: z.string().describe("目标路径；项目目录 内显示相对路径。"),
    destinationAbsolutePath: z.string(),
    type: z.enum(["file", "directory", "symlink", "other"]),
    overwritten: z.boolean().describe("写入前目标是否已存在。"),
    moved: z.boolean().describe("是否执行了移动（move=true 且已删除源）。"),
});

export type CopyInput = z.infer<typeof inputSchema>;
export type CopyOutput = z.infer<typeof outputSchema>;

async function pathExists(p: string): Promise<boolean> {
    try {
        await lstat(p);
        return true;
    } catch {
        return false;
    }
}

export const copyTool: ToolDefinition<CopyInput, CopyOutput> = {
    name: "copy",
    description:
        "拷贝或移动文件/目录。**cwd 是项目目录**：source 优先传相对 项目目录 路径，" +
        "绝对路径仅在读取 项目目录 外内容时使用；destination 被严格限制在 项目目录 内，" +
        "绝对路径必须位于 项目目录 内。目录会自动递归拷贝。默认覆盖/合并已存在目标；" +
        "overwrite=false 时目标存在即报错。move=true 时拷贝成功后删除源（重命名/移动）。",
    inputSchema,
    outputSchema,
    execute: async ({ source, destination, overwrite, move }) => {
        const src = resolveReadPath(source);
        const dest = resolveProjectWritePath(destination, {
            allowRoot: true,
        });

        const sourceStat = await lstat(src);
        const destExists = await pathExists(dest);

        if (src === dest) {
            return {
                source: toPreferredPath(src),
                sourceAbsolutePath: src,
                destination: toPreferredPath(dest),
                destinationAbsolutePath: dest,
                type: sourceStat.isDirectory()
                    ? "directory"
                    : sourceStat.isFile()
                        ? "file"
                        : sourceStat.isSymbolicLink()
                            ? "symlink"
                            : "other",
                overwritten: destExists,
                moved: false,
            };
        }

        if (destExists && !overwrite) {
            throw new Error(
                `目标已存在且 overwrite=false，已拒绝覆盖: ${destination}`,
            );
        }

        if (sourceStat.isDirectory()) {
            const rel = relative(src, dest);
            if (
                rel === "" ||
                (!rel.startsWith("..") && !isAbsolute(rel))
            ) {
                throw new Error("目标目录不能位于源目录内部。");
            }
        }

        await mkdir(dirname(dest), { recursive: true });

        await cp(src, dest, {
            recursive: true,
            force: overwrite,
            errorOnExist: !overwrite,
            preserveTimestamps: true,
            dereference: false,
        });

        if (move) {
            await rm(src, {
                recursive: sourceStat.isDirectory(),
                force: false,
                maxRetries: 2,
            });
        }

        const type: "file" | "directory" | "symlink" | "other" =
            sourceStat.isDirectory()
                ? "directory"
                : sourceStat.isFile()
                    ? "file"
                    : sourceStat.isSymbolicLink()
                        ? "symlink"
                        : "other";

        return {
            source: toPreferredPath(src),
            sourceAbsolutePath: src,
            destination: toPreferredPath(dest),
            destinationAbsolutePath: dest,
            type,
            overwritten: destExists,
            moved: move,
        };
    },
};