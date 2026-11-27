// packages/main/src/libs/tooldb/tools/grep.ts
import fg from "fast-glob";
import { createReadStream, promises as fs } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import pMap from "p-map";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import { resolveReadPath, toPreferredPath } from "../path-utils.js";

const matchSchema = z.object({
    file: z.string().describe("项目目录 内显示相对 项目目录 的路径，项目目录 外显示绝对路径。"),
    absolutePath: z.string(),
    lineNumber: z.number().int().positive(),
    column: z.number().int().positive(),
    text: z.string().describe("匹配到的整行文本。"),
    match: z.string().describe("匹配到的子串。"),
});

const inputSchema = z.object({
    pattern: z
        .string()
        .min(1)
        .describe("正则表达式源文本。例如 `TODO|FIXME`。"),
    flags: z
        .string()
        .default("i")
        .describe("正则 flags，例如 `i`、`g`、`im`。"),
    path: z
        .string()
        .trim()
        .min(1)
        .default(".")
        .describe("搜索根目录，相对 项目目录 或绝对路径。"),
    glob: z
        .string()
        .default("**/*")
        .describe("fast-glob 文件匹配模式，相对 path。默认递归匹配所有文件。"),
    includeHidden: z.boolean().default(false),
    ignore: z
        .array(z.string())
        .default(["**/node_modules/**", "**/.git/**"])
        .describe("额外的 fast-glob 忽略模式。"),
    limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .default(200)
        .describe("全局最多返回的匹配行数。"),
    maxLinesPerFile: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe("单文件最多返回的匹配行数。"),
});

const outputSchema = z.object({
    path: z.string(),
    absolutePath: z.string(),
    pattern: z.string(),
    flags: z.string(),
    matchedFiles: z.number().int().nonnegative(),
    matches: z.array(matchSchema),
    truncated: z.boolean().describe("是否因达到 limit 而截断。"),
});

export type GrepInput = z.infer<typeof inputSchema>;
export type GrepOutput = z.infer<typeof outputSchema>;

interface RawMatch {
    absolutePath: string;
    lineNumber: number;
    column: number;
    text: string;
    match: string;
}

async function searchFile(
    filePath: string,
    pattern: string,
    flags: string,
    maxLinesPerFile: number,
): Promise<RawMatch[]> {
    const results: RawMatch[] = [];
    const re = new RegExp(
        pattern,
        flags.includes("g") ? flags : `${flags}g`,
    );

    const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity,
    });

    try {
        let lineNumber = 0;
        for await (const line of rl) {
            lineNumber += 1;
            re.lastIndex = 0;

            let match: RegExpExecArray | null;
            while ((match = re.exec(line)) !== null) {
                results.push({
                    absolutePath: filePath,
                    lineNumber,
                    column: match.index + 1,
                    text: line,
                    match: match[0],
                });

                if (results.length >= maxLinesPerFile) {
                    break;
                }
                if (re.lastIndex === match.index) {
                    re.lastIndex += 1;
                }
            }

            if (results.length >= maxLinesPerFile) {
                break;
            }
        }
    } finally {
        rl.close();
    }

    return results;
}

export const grepTool: ToolDefinition<GrepInput, GrepOutput> = {
    name: "grep",
    description:
        "在文件中搜索正则表达式，流式读取并按行匹配。**cwd 是项目目录**：" +
        "path 优先传相对 项目目录 的路径，glob 相对 path 解析。" +
        "使用 pMap 并行搜索多个文件。返回匹配的文件、行号、列号、整行文本和匹配子串。",
    inputSchema,
    outputSchema,
    execute: async ({
        pattern,
        flags,
        path,
        glob,
        includeHidden,
        ignore,
        limit,
        maxLinesPerFile,
    }) => {
        const baseAbs = resolveReadPath(path);

        const stat = await fs.stat(baseAbs);
        if (!stat.isDirectory()) {
            throw new Error(`搜索根目录不是目录: ${baseAbs}`);
        }

        // 先验证正则合法
        try {
            new RegExp(pattern, flags);
        } catch (error) {
            throw new Error(
                `正则表达式非法: ${(error as Error).message}`,
                { cause: error }, // 添加 cause 保留原始错误链
            );
        }

        const entries = (await fg(glob, {
            cwd: baseAbs,
            onlyFiles: true,
            dot: includeHidden,
            ignore,
            unique: true,
            followSymbolicLinks: false,
            suppressErrors: false,
        })) as string[];

        const rawResults = await pMap(
            entries,
            (entry) => {
                const abs = resolve(baseAbs, entry);
                return searchFile(abs, pattern, flags, maxLinesPerFile);
            },
            { concurrency: 8 },
        );

        const allMatches = rawResults.flat().sort((a, b) =>
            a.absolutePath === b.absolutePath
                ? a.lineNumber - b.lineNumber
                : a.absolutePath.localeCompare(b.absolutePath),
        );

        const truncated = allMatches.length > limit;
        const selected = allMatches.slice(0, limit);

        const uniqueFiles = new Set(selected.map((m) => m.absolutePath));

        const matches = selected.map((m) => ({
            file: toPreferredPath(m.absolutePath),
            absolutePath: m.absolutePath,
            lineNumber: m.lineNumber,
            column: m.column,
            text: m.text,
            match: m.match,
        }));

        return {
            path: toPreferredPath(baseAbs),
            absolutePath: baseAbs,
            pattern,
            flags,
            matchedFiles: uniqueFiles.size,
            matches,
            truncated,
        };
    },
};