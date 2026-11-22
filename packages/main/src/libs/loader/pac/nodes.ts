// nodes.ts
import { throwUnprocessable } from "$libs/utils/err.js";
import type { PacNode } from "$types/shared/api/pac.js";
import fs from "node:fs/promises";
import path from "node:path";
import { stringifyPacMarkdown } from "./markdown.js";
import {
    assertDirectory,
    ensurePacDirectory,
    isErrnoException,
    resolvePacPath,
} from "./path-ops.js";
import {
    assertMarkdownFileName,
    dirnameRel,
    isInside,
    joinRel,
    normalizeNewName,
    toApiPath,
} from "./paths.js";

export async function createPacFile(
    root: string,
    parentPath: string,
    name: string,
): Promise<PacNode> {
    const safeName = normalizeNewName(name);
    assertMarkdownFileName(safeName);

    const parent = await ensurePacDirectory(root, parentPath, {
        allowRoot: true,
    });

    await assertDirectory(parent.abs);

    const destAbs = path.join(parent.abs, safeName);
    if (!isInside(parent.rootAbs, destAbs)) {
        throwUnprocessable("路径越界");
    }

    const rel = joinRel(parent.rel, safeName);
    const raw = stringifyPacMarkdown({}, "");

    try {
        await fs.writeFile(destAbs, raw, { encoding: "utf8", flag: "wx" });
    } catch (err) {
        if (isErrnoException(err) && err.code === "EEXIST") {
            throwUnprocessable("同目录下已存在同名项");
        }
        throw err;
    }

    const stat = await fs.stat(destAbs);

    return {
        id: toApiPath(rel),
        name: safeName,
        type: "file",
        path: toApiPath(rel),
        updatedAt: stat.mtimeMs,
    };
}

export async function createPacFolder(
    root: string,
    parentPath: string,
    name: string,
): Promise<PacNode> {
    const safeName = normalizeNewName(name);

    const parent = await ensurePacDirectory(root, parentPath, {
        allowRoot: true,
    });

    await assertDirectory(parent.abs);

    const destAbs = path.join(parent.abs, safeName);
    if (!isInside(parent.rootAbs, destAbs)) {
        throwUnprocessable("路径越界");
    }

    const rel = joinRel(parent.rel, safeName);

    try {
        await fs.mkdir(destAbs);
    } catch (err) {
        if (isErrnoException(err) && err.code === "EEXIST") {
            throwUnprocessable("同目录下已存在同名项");
        }
        throw err;
    }

    const stat = await fs.stat(destAbs);

    return {
        id: toApiPath(rel),
        name: safeName,
        type: "folder",
        path: toApiPath(rel),
        children: [],
        updatedAt: stat.mtimeMs,
    };
}

export async function renamePacNode(
    root: string,
    apiPath: string,
    newName: string,
): Promise<{ oldPath: string; newPath: string }> {
    const safeName = normalizeNewName(newName);
    const source = await resolvePacPath(root, apiPath, { mustExist: true });

    if (!source.rel) {
        throwUnprocessable("不能重命名 PAC 根目录");
    }

    const sourceStat = await fs.lstat(source.abs);
    if (sourceStat.isFile()) {
        assertMarkdownFileName(safeName);
    }

    const destRel = joinRel(dirnameRel(source.rel), safeName);

    await ensurePacDirectory(root, dirnameRel(destRel), {
        allowRoot: true,
    });

    const dest = await resolvePacPath(root, toApiPath(destRel), {
        mustExist: false,
    });

    if (path.resolve(dest.abs) === path.resolve(source.abs)) {
        return {
            oldPath: toApiPath(source.rel),
            newPath: toApiPath(destRel),
        };
    }

    const destExists = await fs
        .lstat(dest.abs)
        .then(() => true)
        .catch(() => false);

    if (destExists) {
        throwUnprocessable("同目录下已存在同名项");
    }

    await fs.rename(source.abs, dest.abs);

    return {
        oldPath: toApiPath(source.rel),
        newPath: toApiPath(destRel),
    };
}

export async function deletePacNode(
    root: string,
    apiPath: string,
): Promise<void> {
    const target = await resolvePacPath(root, apiPath, { mustExist: true });

    if (!target.rel) {
        throwUnprocessable("不能删除 PAC 根目录");
    }

    const stat = await fs.lstat(target.abs);

    await fs.rm(target.abs, {
        recursive: stat.isDirectory(),
        force: false,
    });
}