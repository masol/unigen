// packages/main/src/libs/tooldb/tools/diff.ts
import { makePatches, stringifyPatches } from "@sanity/diff-match-patch";
import { promises as fs } from "node:fs";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import { resolveReadPath } from "../path-utils.js";

const sourceSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("text"),
        text: z.string().min(1).describe("直接提供文本内容。"),
    }),
    z.object({
        type: z.literal("file"),
        path: z.string().min(1).describe("文件路径，相对 项目目录 或绝对路径。"),
    }),
]);

const inputSchema = z.object({
    original: sourceSchema.describe("原始内容/文件。"),
    modified: sourceSchema.describe("修改后内容/文件。"),
});

const outputSchema = z.object({
    patch: z.string().describe("unified diff 格式的补丁文本。"),
    equal: z.boolean().describe("两个输入是否完全相等。"),
    originalChars: z.number().int().nonnegative(),
    modifiedChars: z.number().int().nonnegative(),
});

export type DiffInput = z.infer<typeof inputSchema>;
export type DiffOutput = z.infer<typeof outputSchema>;

async function resolveSource(src: z.infer<typeof sourceSchema>): Promise<string> {
    if (src.type === "text") return src.text;
    const abs = resolveReadPath(src.path);
    return fs.readFile(abs, "utf8");
}

export const diffTool: ToolDefinition<DiffInput, DiffOutput> = {
    name: "diff",
    description:
        "比较两段文本或两个文件，生成 unified diff 补丁。**cwd 是项目目录**：" +
        "使用 file 类型时，路径优先传相对项目目录路径。生成结果可直接传给 apply_patch。" +
        "适合 Agent 先查看改动、再决定是否应用。",
    inputSchema,
    outputSchema,
    execute: async ({ original, modified }) => {
        const originalText = await resolveSource(original);
        const modifiedText = await resolveSource(modified);

        const patches = makePatches(originalText, modifiedText);
        const patchText = stringifyPatches(patches);

        return {
            patch: patchText,
            equal: originalText === modifiedText,
            originalChars: originalText.length,
            modifiedChars: modifiedText.length,
        };
    },
};