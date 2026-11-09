// packages/main/src/libs/tooldb/tools/file-markdown.ts
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { loadTextFileStrict } from "$libs/searchsrv/file-text-loader.js";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要读取并转换为 Markdown 的文件路径。可传绝对路径；" +
            "相对路径会基于当前任务目录解析为绝对路径。",
        ),
});

const outputSchema = z.object({
    path: z
        .string()
        .describe("实际读取的绝对路径。"),
    markdown: z
        .string()
        .describe(
            "转换后的 Markdown 字符串。空字符串表示文件内容或转换结果为空，" +
            "不代表读取失败。",
        ),
});

type FileMarkdownInput = z.infer<typeof inputSchema>;
type FileMarkdownOutput = z.infer<typeof outputSchema>;

function resolveProjectPath(raw: string): string {
    const ctx = getRunnerContext();
    const prj = ctx.prj
    return prj.getPath(raw);
}

/**
 * 内建 tool：读取文件并转换为 Markdown 字符串。
 *
 * 这不是 readFile：返回的是 @mdgate/converters 转换后的 Markdown。
 * 读取/转换失败会抛错，调用方可以明确区分“空文件”和“失败”。
 */
export const fileMarkdownToolDef: ToolDefinition<
    FileMarkdownInput,
    FileMarkdownOutput
> = {
    name: "file_to_markdown",
    description:
        "读取指定文件并转换为 Markdown 字符串返回。不是 readFile：" +
        "会按文件格式自动转换（文本/源码、Office、PDF、HTML、CSV 等由 " +
        "@mdgate/converters 处理；图片/语音等媒体识别能力取决于转换器配置，" +
        "未配置时可能失败或忽略）。相对路径会基于当前任务目录解析为绝对路径。" +
        "读取或转换失败会抛错；空字符串表示文件内容或转换结果为空。",
    inputSchema,
    outputSchema,
    execute: async ({ path: rawPath }) => {
        const trimmed = rawPath.trim();
        if (!trimmed) {
            throw new Error("path 不能为空。");
        }

        const absPath = path.isAbsolute(trimmed)
            ? trimmed
            : resolveProjectPath(trimmed);

        if (!path.isAbsolute(absPath)) {
            throw new Error(`无法将路径解析为绝对路径: ${trimmed}`);
        }

        const markdown = await loadTextFileStrict(absPath);

        return {
            path: absPath,
            markdown,
        };
    },
};