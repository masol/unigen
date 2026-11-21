// packages/main/src/libs/loader/zip.ts
//
// 兼容 shim：真正的实现已迁移到 archive.ts（统一入口）。
// 保留本文件是为了不破坏既有的 `$libs/loader/zip.js` 引用。
//
// 新代码请使用 `$libs/loader/archive.js` 的：
//   - safeArchiveRelativeName / safeZipRelativeName（同义）
//   - safeInstallDirName
//   - entryDirName
//   - extractArchive / listArchiveEntries / findShallowestFile
//
// 本文件仅保留 zip 专用 + 旧 API：
//   - findShallowestFileEntry(zip: AdmZip, fileName)
//   - extractZipSubtree(zip: AdmZip, rootDir, targetRoot)

import AdmZip from "adm-zip";
import { ensureDir } from "fs-extra";
import { writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import {
    entryDirName as archiveEntryDirName,
    safeInstallDirName as archiveSafeInstallDirName,
    safeArchiveRelativeName,
} from "./archive.js";

export {
    safeArchiveRelativeName,
    safeArchiveRelativeName as safeZipRelativeName
} from "./archive.js";

export const safeInstallDirName = archiveSafeInstallDirName;
export const entryDirName = archiveEntryDirName;

type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

function normalizeZipName(name: string): string {
    return name.replace(/\\/g, "/");
}

function entryDepth(name: string): number {
    return normalizeZipName(name).split("/").length;
}

/**
 * 查找层级最浅的目标文件。
 *
 * 用于 SKILL.md / meta.json 这类入口文件；如果 zip 内存在多个，
 * 选择层级最浅的一个，避免误选 references/examples 中的同名文件。
 *
 * 新代码建议使用 `archive.ts#findShallowestFile(archivePath, fileName)`
 * ——按路径自动支持 zip / tar，无需手动构造 AdmZip。
 */
export function findShallowestFileEntry(
    zip: AdmZip,
    fileName: string,
): ZipEntry | null {
    const target = fileName.toLowerCase();
    const entries = zip
        .getEntries()
        .filter(
            (entry) =>
                !entry.isDirectory &&
                posix.basename(normalizeZipName(entry.entryName)).toLowerCase() ===
                target,
        )
        .sort((a, b) => entryDepth(a.entryName) - entryDepth(b.entryName));

    return entries[0] ?? null;
}

/**
 * 将 zip 中 rootDir 子树复制到 targetRoot。
 *
 * rootDir 必须带尾部 /；根目录传空串。路径穿越条目会被跳过。
 *
 * 新代码建议使用 `archive.ts#extractArchive`（按路径自动支持 zip / tar）。
 */
export async function extractZipSubtree(
    zip: AdmZip,
    rootDir: string,
    targetRoot: string,
): Promise<void> {
    for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;

        const entryName = normalizeZipName(entry.entryName);
        if (!entryName.startsWith(rootDir)) continue;

        const relative = entryName.slice(rootDir.length);
        const safeRelative = safeArchiveRelativeName(relative);
        if (!safeRelative) continue;

        const dest = join(targetRoot, safeRelative);
        await ensureDir(dirname(dest));
        await writeFile(dest, entry.getData());
    }
}