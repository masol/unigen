import matter from "@11ty/gray-matter";
import Logger from "electron-log/main.js";
import fs from "node:fs/promises";
import type { PacFrontMatter } from "../type.js";

export interface PacSourceFile {
    fm: PacFrontMatter;
    body: string;
}

/**
 * 抽取 PAC 文件的 front matter 与正文。
 *
 * 本阶段只负责读取、解析；正文允许为空。
 * front matter 解析失败时安全忽略，视为空，正文回退为全文。
 */
export async function extractFrontMatter(sourcePath: string): Promise<PacSourceFile> {
    const raw = await fs.readFile(sourcePath, "utf-8");

    let fm: PacFrontMatter = {};
    let body = raw.trim();

    try {
        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
        fm = structuredClone(parsed.data ?? {}) as PacFrontMatter;
        body = (parsed.content ?? "").trim();
    } catch (e) {
        // 解析失败时无法可靠剥离 front matter 边界，退化为“全文即正文”。
        Logger.warn(
            `[PAC] front matter 解析失败，已忽略并视为空: ${sourcePath} ` +
            `(${e instanceof Error ? e.message : String(e)})`,
        );
    }

    return { fm, body };
}