// packages/main/src/libs/blueprint/capability/local/agent/attachments.ts

import {
    convertSchema,
    fileMarkdownToolDef,
} from "$libs/tooldb/tools/read_file.js";
import { escapeTableCell } from "$libs/utils/str.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import Fuse from "fuse.js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * 动态附件读取工具名。
 *
 * 刻意使用独立名称，避免覆盖 tooldb 中已注册的文件工具：
 * 原工具仍可正常使用，本工具只负责“本次上传附件”的清单说明与按附件定位读取。
 */
export const ATTACHMENT_READ_TOOL_NAME = "read_attachment";

interface AttachmentInfo {
    index: number;
    rawPath: string;
    absPath: string;
    fileName: string;
    size: number | null;
}

const attachmentInputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
            "附件清单中的 path，优先使用。必须属于本次附件清单，不接受任意路径。",
        ),
    index: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe("附件清单中的序号（从 1 开始）。不确定 path 时可传。"),
    filename: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
            "附件文件名。精确匹配失败时会做模糊匹配，以容错文件名的小幅错误。",
        ),
    convert: convertSchema,
});

type AttachmentInput = z.infer<typeof attachmentInputSchema>;

function resolveAttachmentPath(ctx: IRunnerContext, rawPath: string): string {
    // 已是绝对路径时直接返回：getPath 会把绝对路径当相对路径再拼一次项目根目录，
    // 导致 /home/a/f.png 变成 <projectRoot>/home/a/f.png。
    if (path.isAbsolute(rawPath)) {
        return rawPath;
    }

    try {
        const prj = ctx.prj as { getPath?: (p: string) => string } | undefined;
        if (prj?.getPath) {
            return prj.getPath(rawPath);
        }
    } catch (e) {
        Logger.debug(`[PAC] 解析附件路径失败: ${rawPath}`, e);
    }
    return path.resolve(rawPath);
}

function readFileSize(absPath: string): number | null {
    try {
        const st = fs.statSync(absPath);
        return st.isFile() ? st.size : null;
    } catch {
        return null;
    }
}

function formatFileSize(bytes: number | null): string {
    if (bytes === null) return "未知";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = units[0];
    for (let i = 1; i < units.length && value >= 1024; i++) {
        value /= 1024;
        unit = units[i];
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}


function getBaseName(value: string): string {
    const normalized = value.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || value;
}

function normalizePathForCompare(value: string): string {
    return value.replace(/\\/g, "/").toLowerCase();
}

function collectAttachments(ctx: IRunnerContext): {
    attachments: AttachmentInfo[];
    specialCount: number;
} {
    const rawFiles = Array.isArray(ctx.files) ? ctx.files : [];
    const specialAttachments: string[] = [];
    const attachments: AttachmentInfo[] = [];

    for (const file of rawFiles) {
        if (typeof file !== "string") continue;

        const rawPath = file.trim();
        if (!rawPath) continue;

        if (rawPath.startsWith("::")) {
            specialAttachments.push(rawPath);
            continue;
        }

        const absPath = resolveAttachmentPath(ctx, rawPath);
        attachments.push({
            index: attachments.length + 1,
            rawPath,
            absPath,
            fileName: getBaseName(rawPath) || rawPath,
            size: readFileSize(absPath),
        });
    }

    return {
        attachments,
        specialCount: specialAttachments.length,
    };
}

function buildAttachmentToolDescription(attachments: AttachmentInfo[]): string {
    const rows = attachments
        .map((a) => {
            const fileName = escapeTableCell(a.fileName);
            const size = escapeTableCell(formatFileSize(a.size));
            const rawPath = escapeTableCell(a.rawPath);
            return `| ${a.index} | ${fileName} | ${size} | \`${rawPath}\` |`;
        })
        .join("\n");

    return [
        "读取本次用户上传的附件。",
        "",
        "文本/文档返回 Markdown；图片、音频、视频作为多模态素材注入。",
        "",
        `本次可读取附件（共 ${attachments.length} 个）：`,
        "",
        "| 序号 | 文件名 | 大小 | path |",
        "| ---: | --- | ---: | --- |",
        rows,
        "",
        "参数：",
        "- path：优先使用上表 path，原样传入。",
        "- index：附件序号（从 1 开始）。",
        "- filename：附件文件名。精确匹配失败时会做模糊匹配，以容错文件名的小幅错误。",
        "- convert：转换策略，默认 smart。",
        "",
        "定位规则：",
        "- 若同时提供多个选择器，按 path 精确 -> filename 精确 -> index 精确 -> 模糊匹配 的顺序解析。",
        "- 本工具只读取上表列出的本次附件，不接受任意路径。",
        "",
        "调用规则：",
        "- 当用户明确要求读取、查看、分析、总结附件内容，或通过序号/文件名/path 提及附件时，调用本工具。",
        "- 一次只加载当前需要的附件。",
        "- 读取或转换失败会抛错；返回空 markdown 表示文件内容或转换结果为空。",
    ].join("\n");
}

/**
 * 为主 agent 构建动态附件读取工具。
 *
 * - 仅当存在非 "::" 开头的附件时返回工具；
 * - "::" 开头的附件先被过滤到 specialAttachments，不进入本次可读附件表格；
 * - 工具名固定为 ATTACHMENT_READ_TOOL_NAME，与 tooldb 中其他文件工具互不影响；
 * - 只允许读取本次附件清单中的文件，不接受任意路径；
 * - 单附件时对外部传参与否均容错（不对外说明该行为）；
 * - Fuse 懒加载：只有精确匹配全部失败后才初始化。
 */
export function createAttachmentMarkdownTool(
    ctx: IRunnerContext,
): Tool | undefined {
    const { attachments, specialCount } = collectAttachments(ctx);

    if (attachments.length === 0) {
        if (specialCount > 0) {
            Logger.debug(
                `[PAC] 本次仅有 ${specialCount} 个 "::" 开头的内部附件，未注入 ${ATTACHMENT_READ_TOOL_NAME}`,
            );
        }
        return undefined;
    }

    let fuse: Fuse<AttachmentInfo> | undefined;

    const getFuse = (): Fuse<AttachmentInfo> => {
        if (!fuse) {
            fuse = new Fuse<AttachmentInfo>(attachments, {
                includeScore: true,
                ignoreLocation: true,
                threshold: 0.4,
                keys: [
                    { name: "fileName", weight: 0.7 },
                    { name: "rawPath", weight: 0.2 },
                    { name: "absPath", weight: 0.1 },
                ],
            });
        }
        return fuse;
    };

    const findExactByPath = (value: string): AttachmentInfo | undefined => {
        const q = normalizePathForCompare(value);
        return attachments.find(
            (a) =>
                normalizePathForCompare(a.rawPath) === q ||
                normalizePathForCompare(a.absPath) === q,
        );
    };

    const findExactByFileName = (value: string): AttachmentInfo | undefined => {
        const q = value.trim().toLowerCase();
        return attachments.find((a) => a.fileName.toLowerCase() === q);
    };

    const fuzzyFind = (query: string): AttachmentInfo | undefined => {
        const q = query.trim();
        if (!q) return undefined;

        const results = getFuse().search(q);
        const best = results[0];
        if (!best) return undefined;

        if (typeof best.score === "number" && best.score > 0.4) {
            return undefined;
        }

        return best.item;
    };

    const resolveAttachment = (input: AttachmentInput): AttachmentInfo => {
        const hasSelector =
            input.path !== undefined ||
            input.filename !== undefined ||
            input.index !== undefined;

        // 单附件：不强制 LLM 提供选择器，直接返回唯一附件。
        if (!hasSelector) {
            if (attachments.length === 1) {
                return attachments[0];
            }
            throw new Error(
                "存在多个附件，请提供 path、index 或 filename 以选择其中一个附件。",
            );
        }

        // 先做精确匹配，避免不必要的 Fuse 初始化。
        if (input.path) {
            const byPath = findExactByPath(input.path);
            if (byPath) return byPath;
        }

        if (input.filename) {
            const byName = findExactByFileName(input.filename);
            if (byName) return byName;
        }

        if (input.index !== undefined) {
            const byIndex = attachments.find((a) => a.index === input.index);
            if (byIndex) return byIndex;
        }

        // 精确匹配失败后，才懒加载 Fuse 做模糊容错。
        const fuzzyQuery =
            input.filename?.trim() ||
            (input.path ? getBaseName(input.path) : "");

        if (fuzzyQuery) {
            const byFuzzy = fuzzyFind(fuzzyQuery);
            if (byFuzzy) return byFuzzy;
        }

        if (input.path) {
            const byFuzzyPath = fuzzyFind(input.path);
            if (byFuzzyPath) return byFuzzyPath;
        }

        // 单附件兜底：所有匹配都失败时仍返回唯一附件。
        if (attachments.length === 1) {
            return attachments[0];
        }

        const selector = [
            input.path ? `path=${input.path}` : "",
            input.filename ? `filename=${input.filename}` : "",
            input.index !== undefined ? `index=${input.index}` : "",
        ]
            .filter(Boolean)
            .join(", ");

        throw new Error(
            `未找到匹配的附件${selector ? `（${selector}）` : ""}。请从附件清单中选择 index、filename 或 path。`,
        );
    };

    const execute = async (input: AttachmentInput) => {
        const attachment = resolveAttachment(input);
        return fileMarkdownToolDef.execute({
            path: attachment.absPath,
            convert: input.convert,
        });
    };

    const baseConfig = {
        description: buildAttachmentToolDescription(attachments),
        inputSchema: attachmentInputSchema,
        execute,
    };

    const toModelOutput = fileMarkdownToolDef.toModelOutput;
    if (toModelOutput) {
        return tool({
            ...baseConfig,
            // fileMarkdownToolDef.toModelOutput 只读取 output；
            // 其参数签名要求完整的 { toolCallId, input, output }，
            // 这里补一个占位 input 以满足类型，运行时不会使用。
            toModelOutput: async ({ toolCallId, output }) =>
                toModelOutput({
                    toolCallId,
                    input: { path: "", convert: "smart" },
                    output,
                }),
        });
    }

    return tool(baseConfig);
}