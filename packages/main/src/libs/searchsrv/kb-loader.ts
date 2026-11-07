// kb-loader.ts
import Logger from "electron-log/main.js";
import fs from "fs-extra";
import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

export interface ScannedKnowledgeBaseFile {
    /** 文件绝对路径。 */
    path: string;
    /** 相对于知识库目录的路径，统一为 / 分隔，用于 source。 */
    source: string;
}

export interface ScannedKnowledgeBase {
    /** 一级目录名，作为知识库 id。 */
    id: string;
    /** 知识库目录绝对路径。 */
    dir: string;
    name: string;
    description: string;
    files: ScannedKnowledgeBaseFile[];
}

/**
 * meta.json 结构：
 * {
 *   "name": string;        // 非空
 *   "desc": string;        // 非空
 *   "files"?: string[];    // 相对当前知识库目录
 *   "disabled"?: boolean;  // true 时忽略本知识库
 * }
 */
const KbMetaSchema = z.object({
    name: z.string().trim().min(1),
    desc: z.string().trim().min(1),
    files: z.array(z.string()).default([]),
    disabled: z.boolean().optional(),
});

type KbMeta = z.infer<typeof KbMetaSchema>;

/**
 * 扫描根目录的一级子目录；存在合法 meta.json 的子目录视为知识库。
 * meta.json 缺失、解析失败或校验失败的知识库均被忽略。
 * `disabled: true` 的知识库同样跳过，不进入结果。
 */
export async function scanKnowledgeBaseDirectories(
    rootDir: string,
): Promise<ScannedKnowledgeBase[]> {
    const root = resolve(rootDir);

    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        Logger.warn(`[Search] 扫描知识库目录失败: ${root}`, error);
        return [];
    }

    const result: ScannedKnowledgeBase[] = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue;

        const kbDir = join(root, entry.name);
        const metaPath = join(kbDir, "meta.json");

        let meta: KbMeta;
        try {
            const raw = await fs.readJSON(metaPath);
            const parsed = KbMetaSchema.safeParse(raw);
            if (!parsed.success) {
                Logger.warn(
                    `[Search] 知识库 meta.json 校验失败，已忽略: ${metaPath}`,
                    parsed.error,
                );
                continue;
            }
            meta = parsed.data;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "ENOENT") {
                Logger.warn(
                    `[Search] 读取知识库 meta.json 失败，已忽略: ${metaPath}`,
                    error,
                );
            }
            continue;
        }

        if (meta.disabled) {
            Logger.info(`[Search] 知识库已禁用，跳过: ${metaPath}`);
            continue;
        }

        const files: ScannedKnowledgeBaseFile[] = [];

        for (const fileRaw of meta.files) {
            if (!fileRaw.trim()) continue;

            if (isAbsolute(fileRaw)) {
                Logger.warn(
                    `[Search] 知识库 files 必须为相对路径，已忽略: ${metaPath} -> ${fileRaw}`,
                );
                continue;
            }

            const abs = resolve(kbDir, fileRaw);
            const rel = relative(kbDir, abs);

            if (
                !rel ||
                rel === ".." ||
                rel.startsWith(`..${sep}`) ||
                isAbsolute(rel)
            ) {
                Logger.warn(
                    `[Search] 知识库文件越界，已忽略: ${metaPath} -> ${fileRaw}`,
                );
                continue;
            }

            files.push({
                path: abs,
                source: rel.split(sep).join("/"),
            });
        }

        result.push({
            id: entry.name,
            dir: kbDir,
            name: meta.name,
            description: meta.desc,
            files,
        });
    }

    return result;
}