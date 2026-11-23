// packages/main/src/libs/tooldb/tools/apply_patch.ts
import {
    applyPatches,
    parsePatch,
} from "@sanity/diff-match-patch";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";
import {
    resolveProjectWritePath,
    toPreferredPath,
} from "./path-utils.js";

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要应用补丁的文件路径。严格限制在 项目目录 内：优先传相对 项目目录 路径；" +
            "绝对路径必须位于 项目目录 内。文件必须已存在。",
        ),
    patch: z
        .string()
        .min(1)
        .describe("unified diff 补丁文本，通常来自 diff 工具的输出。"),
    allow_partial: z
        .boolean()
        .default(false)
        .describe(
            "是否允许部分补丁块应用失败时仍写入。默认 false：只要有一个补丁块未匹配就报错且不写盘。",
        ),
});

const outputSchema = z.object({
    path: z.string().describe("项目目录 内显示相对 项目目录 的路径。"),
    absolutePath: z.string(),
    applied: z.number().int().nonnegative().describe("成功应用的补丁块数量。"),
    total: z.number().int().nonnegative().describe("补丁块总数。"),
    fullyApplied: z.boolean(),
    changed: z.boolean().describe("文件内容是否发生变化。"),
    bytesBefore: z.number().int().nonnegative(),
    bytesWritten: z.number().int().nonnegative(),
});

export type ApplyPatchInput = z.infer<typeof inputSchema>;
export type ApplyPatchOutput = z.infer<typeof outputSchema>;

export const applyPatchTool: ToolDefinition<ApplyPatchInput, ApplyPatchOutput> = {
    name: "apply_patch",
    description:
        "把 unified diff 补丁应用到指定文件。**cwd 是项目目录**：path 优先传相对 项目目录 的路径。" +
        "默认要求全部补丁块都匹配成功才写盘；allow_partial=true 时允许部分失败并写入。" +
        "应用前会读取原文件，应用后自动写回。",
    inputSchema,
    outputSchema,
    execute: async ({ path, patch, allow_partial }) => {
        const absPath = resolveProjectWritePath(path);
        const original = await readFile(absPath, "utf8");

        const patches = parsePatch(patch) as unknown as Parameters<
            typeof applyPatches
        >[0];
        if (!Array.isArray(patches) || patches.length === 0) {
            throw new Error("patch 中未解析到任何补丁块。");
        }

        const [newText, results] = applyPatches(patches, original);
        const total = results.length;
        const applied = results.filter(Boolean).length;

        if (applied === 0) {
            throw new Error("补丁未匹配任何内容，文件未修改。");
        }

        if (applied < total && !allow_partial) {
            throw new Error(
                `仅应用 ${applied}/${total} 个补丁块；文件未修改。` +
                `可设置 allow_partial=true 强制应用，但可能产生不完整内容。`,
            );
        }

        const changed = newText !== original;
        if (changed) {
            await writeFile(absPath, newText, "utf8");
        }

        return {
            path: toPreferredPath(absPath),
            absolutePath: absPath,
            applied,
            total,
            fullyApplied: applied === total,
            changed,
            bytesBefore: Buffer.byteLength(original, "utf8"),
            bytesWritten: Buffer.byteLength(newText, "utf8"),
        };
    },
};