// packages/main/src/libs/searchsrv/kb-loader.ts
// kb-loader.ts
import Logger from "electron-log/main.js";
import fs from "fs-extra";
import { readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
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
 * 读取单个知识库目录。返回 null 表示该目录不是合法知识库
 * （meta.json 缺失 / 校验失败 / disabled），调用方决定是否跳过。
 *
 * 抽取为独立函数，供全量扫描和单库增量同步复用，
 * 保证两条路径的 meta 校验与路径越界检查完全一致。
 */
async function readKnowledgeBase(
    kbDir: string,
    id: string,
): Promise<ScannedKnowledgeBase | null> {
    const dir = resolve(kbDir);
    const metaPath = join(dir, "meta.json");

    let meta: KbMeta;
    try {
        const raw = await fs.readJSON(metaPath);
        const parsed = KbMetaSchema.safeParse(raw);
        if (!parsed.success) {
            Logger.warn(
                `[Search] 知识库 meta.json 校验失败，已忽略: ${metaPath}`,
                parsed.error,
            );
            return null;
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
        return null;
    }

    if (meta.disabled) {
        Logger.info(`[Search] 知识库已禁用，跳过: ${metaPath}`);
        return null;
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

        const abs = resolve(dir, fileRaw);
        const rel = relative(dir, abs);

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

    return {
        id,
        dir,
        name: meta.name,
        description: meta.desc,
        files,
    };
}

/**
 * 读取单个知识库目录（增量同步用）。
 *
 * 与 scanKnowledgeBaseDirectories 的区别：只 stat/读取这一个目录，
 * 不 readdir 根目录、不触碰任何其它知识库。upsert / install 等
 * 单库变更场景必须走这里，避免无意义的全量扫描。
 */
export async function scanKnowledgeBaseDirectory(
    kbDir: string,
): Promise<ScannedKnowledgeBase | null> {
    const dir = resolve(kbDir);
    return readKnowledgeBase(dir, basename(dir));
}

/**
 * 扫描根目录的一级子目录；存在合法 meta.json 的子目录视为知识库。
 * meta.json 缺失、解析失败或校验失败的知识库均被忽略。
 * `disabled: true` 的知识库同样跳过，不进入结果。
 *
 * 仅用于启动 / embedding 重建等低频全量场景。单库变更请使用
 * scanKnowledgeBaseDirectory。
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

        const kb = await readKnowledgeBase(join(root, entry.name), entry.name);
        if (kb) result.push(kb);
    }

    return result;
}