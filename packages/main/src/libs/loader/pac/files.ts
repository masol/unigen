// files.ts
import { throwUnprocessable } from "$libs/utils/err.js";
import type { PacFileDocument } from "$types/shared/api/pac.js";
import fs from "node:fs/promises";
import path from "node:path";
import { MD_EXT } from "./constants.js";
import {
    parsePacMarkdown,
    stringifyPacMarkdown,
    toJsonObject,
} from "./markdown.js";
import {
    atomicWriteFile,
    ensurePacDirectory,
    isErrnoException,
    resolvePacPath,
} from "./path-ops.js";
import {
    assertMarkdownFileName,
    dirnameRel,
    isInside,
    normalizeRelPath,
    resolveRootAbs,
    toApiPath,
} from "./paths.js";

function emptyPacFile(rel: string): PacFileDocument {
    return {
        path: toApiPath(rel),
        meta: {},
        content: "",
        updatedAt: 0,
    };
}

export async function readPacFile(
    root: string,
    apiPath: string,
): Promise<PacFileDocument> {
    const rel = normalizeRelPath(apiPath, false);

    if (!rel.endsWith(MD_EXT)) {
        throwUnprocessable("只能读取 .md 文件");
    }

    const rootAbs = resolveRootAbs(root);
    const abs = path.join(rootAbs, ...rel.split("/"));

    let rootReal: string;
    try {
        const rootStat = await fs.stat(rootAbs);
        if (!rootStat.isDirectory()) {
            return emptyPacFile(rel);
        }
        rootReal = await fs.realpath(rootAbs);
    } catch {
        return emptyPacFile(rel);
    }

    let real: string;
    try {
        real = await fs.realpath(abs);
    } catch (err) {
        if (
            isErrnoException(err) &&
            (err.code === "ENOENT" || err.code === "ENOTDIR")
        ) {
            return emptyPacFile(rel);
        }
        throw err;
    }

    if (!isInside(rootReal, real)) {
        throwUnprocessable("路径越界");
    }

    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
        return emptyPacFile(rel);
    }

    const raw = await fs.readFile(abs, "utf8");
    const { meta, content } = parsePacMarkdown(raw);

    return {
        path: toApiPath(rel),
        meta,
        content,
        updatedAt: stat.mtimeMs,
    };
}

export async function savePacFile(
    root: string,
    apiPath: string,
    meta: Record<string, unknown>,
    content: string,
): Promise<PacFileDocument> {
    if (typeof content !== "string") {
        throwUnprocessable("content 必须是字符串");
    }

    const rel = normalizeRelPath(apiPath, true);
    if (!rel) {
        throwUnprocessable("不能写入 PAC 根目录");
    }

    assertMarkdownFileName(rel);

    await ensurePacDirectory(root, dirnameRel(rel), { allowRoot: true });

    const resolved = await resolvePacPath(root, rel, { mustExist: false });

    const existing = await fs.lstat(resolved.abs).catch(() => null);

    if (existing) {
        if (existing.isSymbolicLink()) {
            throwUnprocessable("不允许写入符号链接文件");
        }
        if (!existing.isFile()) {
            throwUnprocessable("目标不是文件");
        }

        const real = await fs.realpath(resolved.abs);
        if (!isInside(resolved.rootReal, real)) {
            throwUnprocessable("路径越界");
        }
    }

    const safeMeta = toJsonObject(meta);
    const raw = stringifyPacMarkdown(safeMeta, content);

    await atomicWriteFile(resolved.abs, raw);

    const stat = await fs.stat(resolved.abs);

    return {
        path: toApiPath(resolved.rel),
        meta: safeMeta,
        content,
        updatedAt: stat.mtimeMs,
    };
}