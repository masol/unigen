import { throwPrecondition } from "$libs/utils/err.js";
import matter from "@11ty/gray-matter";
import fs from "node:fs/promises";
import type { PacFrontMatter } from "../type.js";

export interface PacSourceFile {
    fm: PacFrontMatter;
    body: string;
}

/**
 * 抽取 PAC 文件的 front matter 与正文。
 *
 * 本阶段只负责读取、解析、校验正文非空；不处理正文语义。
 */
export async function extractFrontMatter(sourcePath: string): Promise<PacSourceFile> {
    const raw = await fs.readFile(sourcePath, "utf-8");
    const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
    const fm = structuredClone(parsed.data ?? {}) as PacFrontMatter;
    const body = (parsed.content ?? "").trim();

    if (body.length === 0) {
        throwPrecondition(`[PAC] 正文(系统提示词)为空: ${sourcePath}`);
    }

    return { fm, body };
}