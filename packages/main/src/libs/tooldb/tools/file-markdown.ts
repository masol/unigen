// packages/main/src/libs/tooldb/tools/file-markdown.ts
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { loadTextFileStrict } from "$libs/searchsrv/file-text-loader.js";
import { fileTypeFromFile } from "file-type";
import { isText } from "istextorbinary";
import mime from "mime";
import { promises as fs } from "node:fs";
import { basename, isAbsolute } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";

/** 内联给模型的单文件体积上限。超过只返回文本说明，避免撑爆请求体/上下文。 */
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

/** 少数扩展名会探测出非标准 IANA 类型，provider 往往只认规范值。 */
const MEDIA_TYPE_ALIASES: Record<string, string> = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
    "audio/mp3": "audio/mpeg",
    "audio/x-mp3": "audio/mpeg",
    "audio/x-wav": "audio/wav",
    "audio/m4a": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/aac": "audio/aac",
    "video/mov": "video/quicktime",
    "video/x-m4v": "video/mp4",
};

export const convertSchema = z
    .enum(["smart", "on", "off"])
    .optional()
    .default("smart")
    .describe(
        "转换策略。smart（默认）：Office/PDF 等二进制文档转换为 Markdown，" +
        "HTML/CSV/源码/纯文本等文本类原文返回，图片/音频/视频作为多模态素材嵌入。" +
        "on：所有输入强制转换为 Markdown（图片 OCR、音频转写等取决于转换器能力）。" +
        "off：仅文本类原文返回，其余所有文件作为二进制素材嵌入。",
    );

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要读取并交给模型的文件路径。可传绝对路径；" +
            "相对路径会基于当前任务目录解析为绝对路径。",
        ),
    convert: convertSchema,
});

const outputSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("text"),
        path: z.string().describe("实际读取的绝对路径。"),
        mime: z.string().describe("检测到的 MIME 类型。"),
        markdown: z
            .string()
            .describe("转换或原文返回的文本。空字符串表示内容或转换结果为空。"),
    }),
    z.object({
        kind: z.literal("media"),
        path: z.string().describe("实际读取的绝对路径。"),
        mime: z.string().describe("检测到的 MIME 类型。"),
    }),
]);

type FileMarkdownInput = z.infer<typeof inputSchema>;
type FileMarkdownOutput = z.infer<typeof outputSchema>;

function resolveProjectPath(raw: string): string {
    const ctx = getRunnerContext();
    return ctx.prj.getPath(raw);
}

async function detectMime(absPath: string): Promise<string> {
    // 1. 先走 mime.getType，命中就直接返回（同步、零 I/O）
    const mimeType = mime.getType(absPath);
    if (mimeType) {
        return mimeType;
    }
    // 2. 扩展名无法判断时，再读文件头
    const detected = await fileTypeFromFile(absPath);
    return detected?.mime ?? "application/octet-stream";
}

/** 规范成 provider 认的 IANA 类型；去掉 `; charset=utf-8` 这类参数。 */
function normalizeMediaType(mimeType: string): string {
    const normalized = mimeType.split(";")[0]!.trim().toLowerCase();
    return MEDIA_TYPE_ALIASES[normalized] ?? normalized;
}

function isTextLikeMime(mimeType: string): boolean {
    return (
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "application/xml" ||
        mimeType.endsWith("+json") ||
        mimeType.endsWith("+xml")
    );
}

function isMedia(mimeType: string): boolean {
    return (
        mimeType.startsWith("image/") ||
        mimeType.startsWith("audio/") ||
        mimeType.startsWith("video/")
    );
}

function formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export const fileMarkdownToolDef: ToolDefinition<
    FileMarkdownInput,
    FileMarkdownOutput
> = {
    name: "read_file",
    description:
        "读取指定文件并交给模型。默认 smart：二进制文档转 Markdown，文本类原文返回，" +
        "图片/音频/视频作为多模态素材注入。convert 可选 on（全部强转 Markdown）" +
        "或 off（仅文本原文，其余二进制嵌入）。相对路径基于当前任务目录解析为绝对路径。",
    inputSchema,
    outputSchema,
    execute: async ({ path: rawPath, convert }) => {
        const trimmed = rawPath.trim();
        if (!trimmed) {
            throw new Error("path 不能为空。");
        }

        const absPath = isAbsolute(trimmed)
            ? trimmed
            : resolveProjectPath(trimmed);
        if (!isAbsolute(absPath)) {
            throw new Error(`无法将路径解析为绝对路径: ${trimmed}`);
        }

        const mimeType = await detectMime(absPath);

        // smart / off 模式的媒体文件：execute 阶段不读字节，留给 toModelOutput 再读
        if (convert !== "on" && isMedia(mimeType)) {
            return { kind: "media", path: absPath, mime: mimeType };
        }

        // 读取一次 buffer，文本判断、原文解码、文档转换都复用它
        const buffer = await fs.readFile(absPath);

        if (convert === "on") {
            const markdown = await loadTextFileStrict(absPath, buffer);
            return { kind: "text", path: absPath, mime: mimeType, markdown };
        }

        // 内容嗅探优先（空文件时 isText 返回 null，再退回 MIME 判断）
        const textFile =
            isText(basename(absPath), buffer) ?? isTextLikeMime(mimeType);

        if (textFile) {
            const markdown = buffer.toString("utf-8");
            return { kind: "text", path: absPath, mime: mimeType, markdown };
        }

        if (convert === "off") {
            return { kind: "media", path: absPath, mime: mimeType };
        }

        // smart：Office/PDF 等二进制文档 → 转 Markdown
        const markdown = await loadTextFileStrict(absPath, buffer);
        return { kind: "text", path: absPath, mime: mimeType, markdown };
    },

    toModelOutput: async ({ output }) => {
        const filename = basename(output.path);
        const mediaType = normalizeMediaType(output.mime);

        const textHeader = `读取文件: ${filename} (${output.mime})，绝对路径: ${output.path}。`;

        if (output.kind === "text") {
            return {
                type: "content",
                value: [
                    {
                        type: "text",
                        text: `文件: ${filename} (${output.mime})，绝对路径: ${output.path}。`,
                    },
                    // 空字符串 text part 会被部分 provider 拒绝，这里给个占位
                    { type: "text", text: output.markdown || "（文件内容为空）" },
                ],
            };
        }

        // 先看体积，超大文件不整个读进内存
        const { size } = await fs.stat(output.path);
        if (size > MAX_INLINE_BYTES) {
            return {
                type: "content",
                value: [
                    {
                        type: "text",
                        text:
                            `${textHeader}文件大小 ${formatBytes(size)}，` +
                            `超过内联上限 ${formatBytes(MAX_INLINE_BYTES)}，未把内容注入上下文。` +
                            `如需处理请改用其他工具分段读取。`,
                    },
                ],
            };
        }

        // 直接读二进制。
        //
        // 图片走 ToolResultOutput.content 的 image-data part：
        //   - 数据类型是 base64 字符串，mediaType 单独给；
        //   - 这个 part 才会被 AI SDK 转换成下一次请求里真正的 image block；
        //   - 用 message 输入格式 { type: "image", image: {...} } 不会被识别。
        //
        // 音频/视频走 file part（AI SDK 内已有 data: FileData 的通用形态）。
        const bytes = await fs.readFile(output.path);

        if (mediaType.startsWith("image/")) {
            return {
                type: "content",
                value: [
                    { type: "text", text: textHeader },
                    {
                        type: "image-data",
                        data: `data:${mediaType};base64,${bytes.toString("base64")}`,
                        mediaType,
                    },
                ],
            };
        }

        return {
            type: "content",
            value: [
                { type: "text", text: textHeader },
                {
                    type: "file",
                    mediaType,
                    filename,
                    data: { type: "data", data: bytes },
                },
            ],
        };
    },
};