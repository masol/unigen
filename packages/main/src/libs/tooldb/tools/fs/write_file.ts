// packages/main/src/libs/tooldb/tools/write_file.ts
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import {
    resolveProjectWritePath,
    toPreferredPath,
} from "../path-utils.js";

const encodingSchema = z
    .enum(["utf-8", "base64"])
    .default("utf-8")
    .describe(
        "内容编码。utf-8（默认）直接写入文本；base64 会先解码为二进制再写入，" +
        "适合图片、压缩包、字体等非文本文件。",
    );

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "目标文件路径。严格限制在 项目目录 内：优先传相对 项目目录 的路径；" +
            "绝对路径必须位于 项目目录 内。禁止使用 `..` 逃逸 项目目录",
        ),
    content: z
        .string()
        .describe(
            "写入内容。encoding=utf-8 时按文本写入；encoding=base64 时先解码再以二进制写入。",
        ),
    append: z
        .boolean()
        .default(false)
        .describe(
            "是否追加。false（默认）覆盖已有文件；true 在文件末尾追加。父目录会自动创建。",
        ),
    encoding: encodingSchema,
});

const outputSchema = z.object({
    path: z
        .string()
        .describe("后续工具优先使用的路径：项目目录 内为相对路径。"),
    absolutePath: z.string().describe("实际写入的绝对路径。"),
    bytesWritten: z.number().int().nonnegative().describe("本次写入/追加的字节数。"),
    mode: z.enum(["overwrite", "append"]),
    encoding: z.enum(["utf-8", "base64"]),
});

export type WriteFileInput = z.infer<typeof inputSchema>;
export type WriteFileOutput = z.infer<typeof outputSchema>;

function decodeBase64(content: string): Buffer {
    const compact = content.replace(/\s+/g, "");
    if (!compact) return Buffer.alloc(0);

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
        throw new Error("content 不是合法的 base64 字符串。");
    }

    const unpadded = compact.replace(/=+$/, "");
    if (unpadded.length % 4 === 1) {
        throw new Error("content 不是合法的 base64 字符串：长度非法。");
    }

    const padded =
        unpadded + "=".repeat((4 - (unpadded.length % 4)) % 4);
    return Buffer.from(padded, "base64");
}

export const writeFileTool: ToolDefinition<
    WriteFileInput,
    WriteFileOutput
> = {
    name: "write_file",
    description:
        "写入文件到 cwd。**cwd 是项目目录**：优先传相对 项目目录 的路径；" +
        "绝对路径必须位于 项目目录 内，`..` 逃逸 项目目录 会被拒绝。默认覆盖已有文件；" +
        "append=true 时追加。encoding=utf-8 写文本；" +
        "encoding=base64 会先解码再以二进制写入，适合图片/压缩包/字体等非文本文件。" +
        "父目录会自动创建，无需单独 mkdir。",
    inputSchema,
    outputSchema,
    execute: async ({ path, content, append, encoding }) => {
        const absPath = resolveProjectWritePath(path);
        const data =
            encoding === "base64"
                ? decodeBase64(content)
                : Buffer.from(content, "utf8");

        await mkdir(dirname(absPath), { recursive: true });

        if (append) {
            await appendFile(absPath, data);
        } else {
            await writeFile(absPath, data);
        }

        return {
            path: toPreferredPath(absPath),
            absolutePath: absPath,
            bytesWritten: data.byteLength,
            mode: append ? "append" : "overwrite",
            encoding,
        };
    },
};