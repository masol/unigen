// packages/main/src/libs/tooldb/tools/edit_file.ts
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";
import {
    resolveProjectWritePath,
    toPreferredPath,
} from "./path-utils.js";

const replacementSchema = z.object({
    old_text: z
        .string()
        .min(1)
        .describe("要替换的精确文本。必须与文件内容完全一致（含换行/缩进）。"),
    new_text: z
        .string()
        .default("")
        .describe("替换后的文本。空字符串表示删除 old_text。"),
    occurrence: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            "要替换第几次出现的 old_text，从 1 开始。省略时要求 old_text 在文件中唯一；" +
            "不唯一会报错，避免误替换。",
        ),
});

const inputSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要编辑的文件路径。严格限制在 项目目录 内：优先传相对路径；" +
            "绝对路径必须位于 项目目录 内。文件必须已存在。",
        ),
    replacements: z
        .array(replacementSchema)
        .min(1)
        .max(50)
        .describe("一次调用可包含多个不重叠的替换。"),
});

const changeSchema = z.object({
    oldText: z.string(),
    newText: z.string(),
    occurrence: z.number().int().positive().optional(),
    occurrences: z.number().int().describe("old_text 在原始文件中的出现次数。"),
});

const outputSchema = z.object({
    path: z.string().describe("项目目录 内显示相对路径。"),
    absolutePath: z.string(),
    bytesBefore: z.number().int().nonnegative(),
    bytesWritten: z.number().int().nonnegative(),
    changes: z.array(changeSchema),
});

export type EditFileInput = z.infer<typeof inputSchema>;
export type EditFileOutput = z.infer<typeof outputSchema>;

interface Edit {
    from: number;
    to: number;
    newText: string;
}

export const editFileTool: ToolDefinition<EditFileInput, EditFileOutput> = {
    name: "edit_file",
    description:
        "通过精确字符串替换编辑文件。**cwd 是项目目录**：path 优先传相对路径。" +
        "每次调用可包含多个不重叠替换。old_text 必须与文件内容完全一致；" +
        "若 old_text 出现多次，必须用 occurrence 指定替换第几次，否则报错。" +
        "所有替换会先校验（存在性、唯一性、不重叠），全部通过后才写盘，避免半更新。",
    inputSchema,
    outputSchema,
    execute: async ({ path, replacements }) => {
        const absPath = resolveProjectWritePath(path);
        const original = await readFile(absPath, "utf8");

        const edits: Edit[] = [];
        const changes: z.infer<typeof changeSchema>[] = [];

        for (const r of replacements) {
            const positions: number[] = [];
            let idx = original.indexOf(r.old_text);
            while (idx !== -1) {
                positions.push(idx);
                idx = original.indexOf(r.old_text, idx + r.old_text.length);
            }

            const occurrences = positions.length;
            if (occurrences === 0) {
                throw new Error(
                    `old_text 未找到: ${JSON.stringify(r.old_text)}`,
                );
            }

            const targetIndex = r.occurrence ?? 1;
            if (!r.occurrence && occurrences > 1) {
                throw new Error(
                    `old_text 出现 ${occurrences} 次，必须用 occurrence 指定替换第几次: ` +
                    JSON.stringify(r.old_text.slice(0, 80)),
                );
            }
            if (targetIndex > occurrences) {
                throw new Error(
                    `occurrence=${targetIndex} 超出实际出现次数 ${occurrences}: ` +
                    JSON.stringify(r.old_text.slice(0, 80)),
                );
            }

            const pos = positions[targetIndex - 1]!;
            edits.push({
                from: pos,
                to: pos + r.old_text.length,
                newText: r.new_text,
            });
            changes.push({
                oldText: r.old_text,
                newText: r.new_text,
                ...(r.occurrence ? { occurrence: r.occurrence } : {}),
                occurrences,
            });
        }

        edits.sort((a, b) => a.from - b.from);
        for (let i = 1; i < edits.length; i++) {
            if (edits[i - 1]!.to > edits[i]!.from) {
                throw new Error("replacements 存在重叠，无法安全替换。");
            }
        }

        let content = original;
        for (let i = edits.length - 1; i >= 0; i--) {
            const e = edits[i]!;
            content =
                content.slice(0, e.from) + e.newText + content.slice(e.to);
        }

        const bytesBefore = Buffer.byteLength(original, "utf8");
        const bytesWritten = Buffer.byteLength(content, "utf8");

        await writeFile(absPath, content, "utf8");

        return {
            path: toPreferredPath(absPath),
            absolutePath: absPath,
            bytesBefore,
            bytesWritten,
            changes,
        };
    },
};