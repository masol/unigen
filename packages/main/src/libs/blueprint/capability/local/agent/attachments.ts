// packages/main/src/libs/blueprint/capability/local/agent/attachments.ts

import { fileMarkdownToolDef } from "$libs/tooldb/tools/file-markdown.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import fs from "node:fs";
import path from "node:path";

/**
 * 动态附件读取工具名。
 *
 * 刻意使用独立名称，避免覆盖 tooldb 中已注册的 `file_to_markdown`：
 * 原工具仍可正常使用，本工具只负责“本次上传附件”的清单说明与按 path 读取。
 */
export const ATTACHMENT_READ_TOOL_NAME = "read_attachment";

interface AttachmentInfo {
    index: number;
    rawPath: string;
    fileName: string;
    size: number | null;
}

function resolveAttachmentPath(ctx: IRunnerContext, rawPath: string): string {
    try {
        const prj = ctx.prj as { getPath?: (p: string) => string } | undefined;
        if (prj?.getPath) {
            return prj.getPath(rawPath);
        }
    } catch (e) {
        Logger.debug(`[PAC] 解析附件路径失败: ${rawPath}`, e);
    }
    return path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);
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

function escapeTableCell(value: string): string {
    return value
        .replace(/`/g, "\\`")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ");
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
            fileName: path.basename(rawPath) || rawPath,
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
        "读取本次用户上传的附件并转换为 Markdown 字符串返回。",
        "",
        `本次用户上传了 ${attachments.length} 个可读取附件：`,
        "",
        "| 序号 | 文件名 | 大小 | path（调用时原样传入） |",
        "| ---: | --- | ---: | --- |",
        rows,
        "",
        "调用规则：",
        "- 当用户明确要求读取、查看、分析、总结附件内容，或通过序号/文件名提及附件时，调用本工具。",
        "- 参数 path 必须使用下表中对应附件的 path，不要猜测或拼接路径。",
        "- 序号仅用于展示和与用户沟通，不要作为参数传入；本工具只接受 path。",
        "- 一次只加载当前需要的附件。",
        "- 读取或转换失败会抛错；返回空字符串表示文件内容或转换结果为空。",
    ].join("\n");
}

/**
 * 为主 agent 构建动态附件读取工具。
 *
 * - 仅当存在非 "::" 开头的附件时返回工具；
 * - "::" 开头的附件先被过滤到 specialAttachments，不进入本次可读附件表格；
 * - 工具名固定为 ATTACHMENT_READ_TOOL_NAME，与 tooldb 的 file_to_markdown 互不影响；
 * - 入参只接受 path，不接受序号。
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

    return tool({
        description: buildAttachmentToolDescription(attachments),
        inputSchema: fileMarkdownToolDef.inputSchema,
        execute: async (input) => {
            const out = await fileMarkdownToolDef.execute(input as { path: string });
            return out.markdown;
        },
    });
}