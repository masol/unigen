// kb-loader.ts
import Logger from "electron-log/main.js";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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

interface KbMetaJson {
    name?: unknown;
    desc?: unknown;
    files?: unknown;
}

/**
 * 扫描根目录的一级子目录；存在 meta.json 的子目录视为知识库。
 *
 * meta.json:
 * {
 *   "name": string;
 *   "desc": string;
 *   "files": string[]; // 相对当前知识库目录
 * }
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

        let raw: string;
        try {
            raw = await readFile(metaPath, "utf8");
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

        let parsed: KbMetaJson;
        try {
            parsed = JSON.parse(raw) as KbMetaJson;
        } catch (error) {
            Logger.warn(
                `[Search] 知识库 meta.json 解析失败，已忽略: ${metaPath}`,
                error,
            );
            continue;
        }

        const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
        const description =
            typeof parsed.desc === "string" ? parsed.desc.trim() : "";

        if (!name || !description) {
            Logger.warn(
                `[Search] 知识库 meta.json 缺少 name/desc，已忽略: ${metaPath}`,
            );
            continue;
        }

        const filesRaw = Array.isArray(parsed.files) ? parsed.files : [];
        if (!Array.isArray(parsed.files)) {
            Logger.warn(
                `[Search] 知识库 meta.json 的 files 不是数组，按空文件列表处理: ${metaPath}`,
            );
        }

        const files: ScannedKnowledgeBaseFile[] = [];

        for (const fileRaw of filesRaw) {
            if (typeof fileRaw !== "string" || !fileRaw.trim()) continue;

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
            name,
            description,
            files,
        });
    }

    return result;
}