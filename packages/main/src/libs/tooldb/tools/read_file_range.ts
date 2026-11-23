// packages/main/src/libs/tooldb/tools/read_file_range.ts
import { createReadStream, promises as fs } from "node:fs";
import { createInterface } from "node:readline";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";
import { resolveReadPath, toPreferredPath } from "./path-utils.js";

const MAX_RANGE_LINES = 2000;

const inputSchema = z
    .object({
        path: z
            .string()
            .trim()
            .min(1)
            .describe(
                "要读取的文件路径。优先传相对 项目目录 的路径；绝对路径仅在文件位于 项目目录 外时使用。",
            ),
        start_line: z
            .number()
            .int()
            .positive()
            .default(1)
            .describe("起始行号，从 1 开始。"),
        end_line: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("结束行号（包含）。与 line_count 二选一。"),
        line_count: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("从 start_line 开始读取的行数。与 end_line 二选一。"),
    })
    .superRefine((v, ctx) => {
        if (v.end_line != null && v.line_count != null) {
            ctx.addIssue({
                code: "custom",
                message: "end_line 与 line_count 只能提供一个。",
                path: ["end_line"],
            });
        }
        if (v.end_line != null && v.end_line < v.start_line) {
            ctx.addIssue({
                code: "custom",
                message: "end_line 不能小于 start_line。",
                path: ["end_line"],
            });
        }
    });

const outputSchema = z.object({
    path: z.string().describe("文件路径；项目目录 内显示相对路径。"),
    absolutePath: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().nonnegative().describe("实际返回的最后一行；文件为空时为 0。"),
    totalLines: z.number().int().nonnegative(),
    truncated: z.boolean().describe("是否因为超过最大行数而被截断。"),
    content: z.string().describe("行内容，以换行符连接，不含结尾换行。"),
});

export type ReadFileRangeInput = z.infer<typeof inputSchema>;
export type ReadFileRangeOutput = z.infer<typeof outputSchema>;

export const readFileRangeTool: ToolDefinition<
    ReadFileRangeInput,
    ReadFileRangeOutput
> = {
    name: "read_file_range",
    description:
        "按行读取文件的指定区间。**cwd 是项目目录**：path 优先传相对 项目目录。" +
        "通过 start_line + end_line 或 start_line + line_count 指定范围。" +
        "单次最多返回 2000 行，超出会截断并标记 truncated。适合读取大文件的部分内容，" +
        "避免把整个文件读进上下文。",
    inputSchema,
    outputSchema,
    execute: async ({ path, start_line, end_line, line_count }) => {
        const absPath = resolveReadPath(path);

        const stat = await fs.stat(absPath);
        if (!stat.isFile()) {
            throw new Error(`不是普通文件: ${absPath}`);
        }

        const requestedEnd =
            end_line ?? (line_count != null ? start_line + line_count - 1 : Infinity);

        const maxEnd = start_line + MAX_RANGE_LINES - 1;
        const effectiveEnd = Math.min(requestedEnd, maxEnd);
        const truncated = requestedEnd > maxEnd;

        const lines: string[] = [];
        let totalLines = 0;

        const rl = createInterface({
            input: createReadStream(absPath),
            crlfDelay: Infinity,
        });

        try {
            for await (const line of rl) {
                totalLines += 1;
                if (totalLines >= start_line) {
                    lines.push(line);
                }
                if (totalLines >= effectiveEnd) {
                    break;
                }
            }
        } finally {
            rl.close();
        }

        const actualEnd = Math.min(effectiveEnd, totalLines);
        const start = Math.min(start_line, totalLines + 1);
        const end = Math.max(start - 1, actualEnd);

        return {
            path: toPreferredPath(absPath),
            absolutePath: absPath,
            startLine: start,
            endLine: end,
            totalLines,
            truncated,
            content: lines.join("\n"),
        };
    },
};