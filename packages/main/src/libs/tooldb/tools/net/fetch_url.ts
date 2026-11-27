// packages/main/src/libs/tooldb/tools/fetch_url.ts
import { loadTextFileStrict } from "$libs/searchsrv/file-text-loader.js";
import mime from "mime";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import {
    resolveProjectWritePath,
    toPreferredPath,
} from "../path-utils.js";

const MAX_INLINE_CHARS = 200_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

const inputSchema = z
    .object({
        url: z.url().describe("要请求的 URL。"),
        method: z
            .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
            .default("GET"),
        headers: z
            .record(z.string(), z.string())
            .optional()
            .describe("附加请求头。"),
        body: z
            .string()
            .optional()
            .describe("请求体，仅 POST/PUT/PATCH 时使用。"),
        timeout_ms: z
            .number()
            .int()
            .positive()
            .max(120_000)
            .default(30_000)
            .describe("请求超时（毫秒），默认 30000。"),
        return_content: z
            .boolean()
            .default(true)
            .describe("是否返回响应体内容。false 时只返回元信息。"),
        convert: z
            .enum(["smart", "on", "off"])
            .default("smart")
            .describe(
                "内容转换策略。smart：文本直接返回，二进制文档(word,pdf...)自动转 Markdown，" +
                "媒体不内联；on：尽量转 Markdown(HTML会转化为Markdown)；off：仅返回原始文本或提示保存。",
            ),
        output_path: z
            .string()
            .trim()
            .optional()
            .describe("将响应体保存到 项目目录 内的路径（可选，需要 return_content=true）。"),
    })
    .refine((v) => v.return_content || !v.output_path, {
        message: "output_path 需要 return_content=true",
    });

const outputSchema = z.object({
    ok: z.literal(true),
    status: z.number().int(),
    statusText: z.string(),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    contentType: z.string().optional(),
    durationMs: z.number().nonnegative(),
    size: z.number().int().nonnegative(),
    content: z.string().nullable(),
    converted: z.boolean(),
    outputPath: z.string().optional(),
    outputAbsolutePath: z.string().optional(),
    hint: z.string().optional(),
});

export type FetchUrlInput = z.infer<typeof inputSchema>;
export type FetchUrlOutput = z.infer<typeof outputSchema>;

function isTextLike(contentType?: string): boolean {
    if (!contentType) return false;
    const mimeType = contentType.split(";")[0]!.trim().toLowerCase();
    return (
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "application/xml" ||
        mimeType === "application/javascript" ||
        mimeType.endsWith("+json") ||
        mimeType.endsWith("+xml")
    );
}

function guessExtension(url: string, contentType?: string): string {
    const mimeType = contentType?.split(";")[0]?.trim();
    if (mimeType) {
        const ext = mime.getExtension(mimeType);
        if (ext) return ext.startsWith(".") ? ext : `.${ext}`;
    }

    try {
        const pathname = new URL(url).pathname;
        const dot = pathname.lastIndexOf(".");
        if (dot >= 0) {
            const ext = pathname.slice(dot).toLowerCase();
            if (/^\.[a-z0-9]{1,10}$/.test(ext)) return ext;
        }
    } catch {
        // ignore
    }

    return ".txt";
}

async function bufferToMarkdown(
    buffer: Buffer,
    url: string,
    contentType?: string,
): Promise<string> {
    const ext = guessExtension(url, contentType);
    const dir = await fs.mkdtemp(join(tmpdir(), "fetch-url-"));
    const file = join(dir, `content${ext}`);
    try {
        await fs.writeFile(file, buffer);
        return await loadTextFileStrict(file, buffer);
    } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}

export const fetchUrlTool: ToolDefinition<FetchUrlInput, FetchUrlOutput> = {
    name: "fetch_url",
    description:
        "发起 HTTP 请求并可选返回响应内容。**cwd 是项目目录**：" +
        "output_path 必须位于 项目目录 内。默认 smart 转换：纯文本直接返回，二进制文档(pdf,word等)转 Markdown，" +
        "媒体不内联。convert=off 时仅返回原始文本或要求保存到 output_path。",
    inputSchema,
    outputSchema,
    execute: async ({
        url,
        method,
        headers,
        body,
        timeout_ms,
        return_content,
        convert,
        output_path,
    }) => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeout_ms);

        const startedAt = Date.now();
        try {
            const res = await fetch(url, {
                method,
                headers,
                body:
                    method === "GET" || method === "HEAD" ? undefined : body,
                signal: ac.signal,
                redirect: "follow",
            });

            const contentType = res.headers.get("content-type") ?? undefined;
            const headerObj: Record<string, string> = {};
            res.headers.forEach((value, key) => {
                headerObj[key] = value;
            });

            const base = {
                ok: true as const,
                status: res.status,
                statusText: res.statusText,
                url: res.url || url,
                headers: headerObj,
                contentType,
                durationMs: Date.now() - startedAt,
                size: 0,
                content: null as string | null,
                converted: false,
            };

            if (!return_content) {
                const length = Number(res.headers.get("content-length") ?? 0);
                return {
                    ...base,
                    size: length || 0,
                };
            }

            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length > MAX_RESPONSE_BYTES) {
                throw new Error(
                    `响应体 ${buffer.length} 字节超过上限 ${MAX_RESPONSE_BYTES}，请改用 output_path 落地后处理。`,
                );
            }

            base.size = buffer.length;

            let outputAbs: string | undefined;
            if (output_path) {
                outputAbs = resolveProjectWritePath(output_path);
                await fs.mkdir(join(outputAbs, ".."), { recursive: true });
                await fs.writeFile(outputAbs, buffer);
            }

            const textLike = isTextLike(contentType);

            if (convert === "off") {
                if (textLike) {
                    const text = buffer.toString("utf8");
                    return {
                        ...base,
                        size: buffer.length,
                        content:
                            text.length > MAX_INLINE_CHARS
                                ? text.slice(0, MAX_INLINE_CHARS) +
                                `\n...[内容过长，已截断 ${text.length - MAX_INLINE_CHARS} 字符]`
                                : text,
                        ...(outputAbs
                            ? {
                                outputPath: toPreferredPath(outputAbs),
                                outputAbsolutePath: outputAbs,
                            }
                            : {}),
                        hint: textLike
                            ? undefined
                            : "响应为二进制内容，未内联返回。可设置 output_path 保存后用 read_file 查看。",
                    };
                }

                return {
                    ...base,
                    size: buffer.length,
                    ...(outputAbs
                        ? {
                            outputPath: toPreferredPath(outputAbs),
                            outputAbsolutePath: outputAbs,
                        }
                        : {}),
                    hint: "响应为二进制内容，未内联返回。可设置 output_path 保存后用 read_file 查看。",
                };
            }

            // smart / on
            let content: string;
            let converted = false;
            const mimeType = contentType?.split(";")[0]?.trim().toLowerCase();

            if (textLike && mimeType !== "text/html") {
                content = buffer.toString("utf8");
            } else {
                content = await bufferToMarkdown(buffer, url, contentType);
                converted = true;
            }

            if (content.length > MAX_INLINE_CHARS) {
                content =
                    content.slice(0, MAX_INLINE_CHARS) +
                    `\n...[内容过长，已截断 ${content.length - MAX_INLINE_CHARS} 字符]`;
            }

            return {
                ...base,
                size: buffer.length,
                content,
                converted,
                ...(outputAbs
                    ? {
                        outputPath: toPreferredPath(outputAbs),
                        outputAbsolutePath: outputAbs,
                    }
                    : {}),
            };
        } finally {
            clearTimeout(timer);
        }
    },
};