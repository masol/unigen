// packages/main/src/libs/loader/zip.ts
import AdmZip from "adm-zip";
import { ensureDir } from "fs-extra";
import { writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

type ZipEntry = ReturnType<AdmZip["getEntries"]>[number];

function normalizeZipName(name: string): string {
    return name.replace(/\\/g, "/");
}

function containsControlChar(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) < 0x20) return true;
    }
    return false;
}

/**
 * 将 zip 内路径归一化为安全相对路径。
 *
 * zip 条目统一按 POSIX 风格处理；同时拒绝 Windows 反斜杠逃逸、
 * ../ 逃逸、盘符路径与空字节。
 */
export function safeZipRelativeName(name: string): string | null {
    const normalized = posix
        .normalize(normalizeZipName(name))
        .replace(/^\/+/, "");

    if (!normalized || normalized === "." || normalized === "..") {
        return null;
    }

    if (normalized.startsWith("../") || normalized.includes("/../")) {
        return null;
    }

    if (/^[a-zA-Z]:/.test(normalized) || containsControlChar(normalized)) {
        return null;
    }

    return normalized;
}

function entryDepth(name: string): number {
    return normalizeZipName(name).split("/").length;
}

/**
 * 查找层级最浅的目标文件。
 *
 * 用于 SKILL.md / meta.json 这类入口文件；如果 zip 内存在多个，
 * 选择层级最浅的一个，避免误选 references/examples 中的同名文件。
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

/** 返回入口文件所在目录，带尾部 /；根目录返回空串。 */
export function entryDirName(entryName: string): string {
    const normalized = normalizeZipName(entryName);
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(0, idx + 1) : "";
}

/**
 * 安装目录名安全化。
 *
 * 只取最后一段，允许中文等 Unicode 字符，但拒绝路径分隔符、
 * Windows 非法字符、控制字符与空目录名。
 */
export function safeInstallDirName(name: string): string {
    const base =
        normalizeZipName(name.trim())
            .split("/")
            .filter(Boolean)
            .pop() ?? "";

    if (!base || base === "." || base === "..") {
        throw new Error(`非法安装目录名: ${name}`);
    }

    if (/[<>:"/\\|?*]/.test(base) || containsControlChar(base)) {
        throw new Error(`安装目录名包含非法字符: ${base}`);
    }

    return base;
}

/**
 * 将 zip 中 rootDir 子树复制到 targetRoot。
 *
 * rootDir 必须带尾部 /；根目录传空串。路径穿越条目会被跳过。
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
        const safeRelative = safeZipRelativeName(relative);
        if (!safeRelative) continue;

        const dest = join(targetRoot, safeRelative);
        await ensureDir(dirname(dest));
        await writeFile(dest, entry.getData());
    }
}