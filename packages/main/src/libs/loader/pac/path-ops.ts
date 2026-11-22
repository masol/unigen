// path-ops.ts
import { throwUnprocessable } from "$libs/utils/err.js";
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
    dirnameRel,
    isInside,
    normalizeRelPath,
    resolveRootAbs,
    toApiPath,
} from "./paths.js";

export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
    return typeof err === "object" && err !== null && "code" in err;
}

async function statOrNull(abs: string): Promise<Stats | null> {
    try {
        return await fs.stat(abs);
    } catch (err) {
        if (isErrnoException(err) && err.code === "ENOENT") {
            return null;
        }
        throw err;
    }
}

async function lstatOrNull(abs: string): Promise<Stats | null> {
    try {
        return await fs.lstat(abs);
    } catch (err) {
        if (isErrnoException(err) && err.code === "ENOENT") {
            return null;
        }
        throw err;
    }
}

export async function assertDirectory(abs: string): Promise<void> {
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) {
        throwUnprocessable("目标不是文件夹");
    }
}

export async function atomicWriteFile(
    filePath: string,
    data: string,
): Promise<void> {
    const dir = path.dirname(filePath);
    const tmp = path.join(
        dir,
        `.${path.basename(filePath)}.${randomUUID()}.tmp`,
    );

    try {
        await fs.writeFile(tmp, data, { encoding: "utf8", flag: "wx" });
        await fs.rename(tmp, filePath);
    } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
}

/**
 * 确保 PAC 根目录存在（仅用于写操作）。
 * 根目录不存在时按绝对路径递归创建。
 */
export async function ensurePacRoot(
    root: string,
): Promise<{ rootAbs: string; rootReal: string }> {
    const rootAbs = resolveRootAbs(root);

    let stat = await statOrNull(rootAbs);
    if (!stat) {
        await fs.mkdir(rootAbs, { recursive: true });
        stat = await fs.stat(rootAbs);
    }

    if (!stat.isDirectory()) {
        throwUnprocessable("PAC 根目录不是文件夹");
    }

    const rootReal = await fs.realpath(rootAbs);
    return { rootAbs, rootReal };
}

async function assertDirInside(abs: string, rootReal: string): Promise<void> {
    const stat = await fs.lstat(abs);

    if (stat.isSymbolicLink()) {
        let real: string;
        try {
            real = await fs.realpath(abs);
        } catch {
            throwUnprocessable("路径包含无效符号链接");
        }
        if (!isInside(rootReal, real)) {
            throwUnprocessable("路径越界");
        }
        const target = await fs.stat(abs);
        if (!target.isDirectory()) {
            throwUnprocessable("路径中存在同名文件，无法创建目录");
        }
        return;
    }

    if (!stat.isDirectory()) {
        throwUnprocessable("路径中存在同名文件，无法创建目录");
    }

    const real = await fs.realpath(abs);
    if (!isInside(rootReal, real)) {
        throwUnprocessable("路径越界");
    }
}

/**
 * 确保 PAC 根目录下的相对目录存在（仅用于写操作）。
 * 逐级创建缺失目录，并对已存在的每一级做符号链接 / 越界检查。
 */
export async function ensurePacDirectory(
    root: string,
    relInput: string,
    opts: { allowRoot?: boolean } = {},
): Promise<{
    abs: string;
    rel: string;
    rootAbs: string;
    rootReal: string;
}> {
    const { rootAbs, rootReal } = await ensurePacRoot(root);
    const rel = normalizeRelPath(relInput, opts.allowRoot === true);

    let abs = rootAbs;

    if (rel) {
        for (const segment of rel.split("/")) {
            abs = path.join(abs, segment);

            const existed = await lstatOrNull(abs);
            if (existed) {
                await assertDirInside(abs, rootReal);
                continue;
            }

            try {
                await fs.mkdir(abs);
            } catch (err) {
                if (isErrnoException(err) && err.code === "EEXIST") {
                    await assertDirInside(abs, rootReal);
                    continue;
                }
                throw err;
            }

            const real = await fs.realpath(abs);
            if (!isInside(rootReal, real)) {
                throwUnprocessable("路径越界");
            }
        }
    }

    return { abs, rel, rootAbs, rootReal };
}

/**
 * 解析 PAC 内路径，供读操作或已确保父目录存在的写操作使用。
 * 不创建任何目录；PAC 根目录不存在时视为不存在。
 */
export async function resolvePacPath(
    root: string,
    relInput: string,
    opts: { allowRoot?: boolean; mustExist?: boolean } = {},
): Promise<{
    abs: string;
    rel: string;
    rootAbs: string;
    rootReal: string;
}> {
    const rootAbs = resolveRootAbs(root);
    const rel = normalizeRelPath(relInput, opts.allowRoot === true);
    const abs = rel ? path.join(rootAbs, ...rel.split("/")) : rootAbs;

    if (!isInside(rootAbs, abs)) {
        throwUnprocessable("路径越界");
    }

    let rootReal: string;
    try {
        rootReal = await fs.realpath(rootAbs);
    } catch {
        if (opts.mustExist) {
            throwUnprocessable(`路径不存在: ${toApiPath(rel)}`);
        }
        throwUnprocessable("PAC 根目录不存在");
    }

    const rootStat = await fs.stat(rootAbs);
    if (!rootStat.isDirectory()) {
        throwUnprocessable("PAC 根目录不是文件夹");
    }

    if (opts.mustExist) {
        let real: string;
        try {
            real = await fs.realpath(abs);
        } catch {
            throwUnprocessable(`路径不存在: ${toApiPath(rel)}`);
        }
        if (!isInside(rootReal, real)) {
            throwUnprocessable("路径越界");
        }
    } else {
        const parentAbs = path.dirname(abs);
        let parentReal: string;
        try {
            parentReal = await fs.realpath(parentAbs);
        } catch {
            throwUnprocessable(`父目录不存在: ${toApiPath(dirnameRel(rel))}`);
        }
        if (!isInside(rootReal, parentReal)) {
            throwUnprocessable("路径越界");
        }
    }

    return { abs, rel, rootAbs, rootReal };
}