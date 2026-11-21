// packages/main/src/libs/loader/archive.ts
//
// 统一压缩包接口：根据后缀自动选择 zip（adm-zip）或 tar（node-tar）。
//
// 支持的格式：.zip / .tar / .tar.gz / .tgz
//
// 安全（与 zip.ts 保持一致）：
//   - 路径统一按 POSIX 处理；
//   - 拒绝路径穿越、绝对路径、Windows 盘符与控制字符；
//   - tar 侧拒绝硬链接 / 符号链接（运行时归档不应包含链接）；
//
// 兼容方案：
//   - 本文件是**新统一入口**，建议新代码优先使用；
//   - `zip.ts` 保留为向后兼容 shim（zip 专用 API + re-export 通用工具）。

import AdmZip from "adm-zip";
import Logger from "electron-log/main.js";
import { ensureDir } from "fs-extra";
import { promises as fs } from "node:fs";
import { dirname, join, posix } from "node:path";
import * as tar from "tar";

// ─── 路径安全工具 ─────────────────────────────────────────

function normalizeArchiveName(name: string): string {
    return name.replace(/\\/g, "/");
}

function containsControlChar(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) < 0x20) return true;
    }
    return false;
}

/**
 * 将归档内路径归一化为安全相对路径。
 *
 * zip 条目统一按 POSIX 风格处理；同时拒绝 Windows 反斜杠逃逸、
 * ../ 逃逸、盘符路径与空字节。
 */
export function safeArchiveRelativeName(name: string): string | null {
    const normalized = posix
        .normalize(normalizeArchiveName(name))
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

/** 兼容旧命名（zip.ts 中的同名工具）。 */
export const safeZipRelativeName = safeArchiveRelativeName;

/**
 * 安装目录名安全化。
 *
 * 只取最后一段，允许中文等 Unicode 字符，但拒绝路径分隔符、
 * Windows 非法字符、控制字符与空目录名。
 */
export function safeInstallDirName(name: string): string {
    const base =
        normalizeArchiveName(name.trim())
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

/** 返回入口文件所在目录，带尾部 /；根目录返回空串。 */
export function entryDirName(entryName: string): string {
    const normalized = normalizeArchiveName(entryName);
    const idx = normalized.lastIndexOf("/");
    return idx >= 0 ? normalized.slice(0, idx + 1) : "";
}

// ─── 归档类型识别 ─────────────────────────────────────────

export type ArchiveKind = "zip" | "tar" | "tar.gz" | "tgz" | "unsupported";

export function detectArchiveKind(filePath: string): ArchiveKind {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".zip")) return "zip";
    if (lower.endsWith(".tar.gz")) return "tar.gz";
    if (lower.endsWith(".tgz")) return "tgz";
    if (lower.endsWith(".tar")) return "tar";
    return "unsupported";
}

function isZipKind(kind: ArchiveKind): boolean {
    return kind === "zip";
}

// ─── 解压 ─────────────────────────────────────────────────

export interface ExtractOptions {
    /** 归档路径（本地文件） */
    archivePath: string;
    /** 解压目标目录 */
    targetDir: string;
    /**
     * 剥离子路径前缀。
     * - zip：按字符串前缀严格剥离；
     * - tar：换算为层级数（`strip` 参数）。
     * 末尾斜杠可选。
     */
    stripPrefix?: string;
    /**
     * 直接按层数剥离（优先于 stripPrefix）。
     * zip / tar 双方都支持。
     */
    stripComponents?: number;
    /** 每个成功解压的条目回调 */
    onEntry?: (relativePath: string, bytes: number) => void;
    /** 取消信号（仅 zip 实现会中途检查；tar 通过 node-tar 内部实现） */
    signal?: AbortSignal;
}

/** 统一解压入口：根据后缀自动分发。 */
export async function extractArchive(opts: ExtractOptions): Promise<void> {
    const kind = detectArchiveKind(opts.archivePath);
    if (kind === "unsupported") {
        throw new Error(
            `不支持的归档格式：${opts.archivePath}。` +
            `目前支持 .zip / .tar / .tar.gz / .tgz。`,
        );
    }
    await ensureDir(opts.targetDir);
    if (opts.signal?.aborted) {
        throw new Error(`解压已取消：${opts.archivePath}`);
    }
    if (isZipKind(kind)) return extractZip(opts);
    return extractTar(opts);
}

function prefixDepth(prefix: string | undefined): number | undefined {
    if (!prefix) return undefined;
    const normalized = normalizeArchiveName(prefix).replace(/^\/+|\/+$/g, "");
    if (!normalized) return undefined;
    const depth = normalized.split("/").filter(Boolean).length;
    return depth > 0 ? depth : undefined;
}

function stripLeading(p: string, n: number): string | null {
    if (n <= 0) return p;
    const parts = p.split("/").filter(Boolean);
    if (parts.length <= n) return null;
    return parts.slice(n).join("/");
}

async function extractZip(opts: ExtractOptions): Promise<void> {
    const zip = new AdmZip(opts.archivePath);
    const prefix = opts.stripPrefix
        ? normalizeArchiveName(opts.stripPrefix).replace(/^\/+/, "")
        : "";
    const stripComponents = opts.stripComponents ?? 0;

    let extracted = 0;
    for (const entry of zip.getEntries()) {
        if (opts.signal?.aborted) {
            throw new Error(`解压已取消：${opts.archivePath}`);
        }
        if (entry.isDirectory) continue;

        const entryName = normalizeArchiveName(entry.entryName);
        let relative = entryName;

        if (prefix) {
            if (!relative.startsWith(prefix)) continue;
            relative = relative.slice(prefix.length);
        }
        if (stripComponents > 0) {
            const stripped = stripLeading(relative, stripComponents);
            if (!stripped) continue;
            relative = stripped;
        }

        const safeRelative = safeArchiveRelativeName(relative);
        if (!safeRelative) continue;

        const data = entry.getData();
        const dest = join(opts.targetDir, safeRelative);
        await ensureDir(dirname(dest));
        await fs.writeFile(dest, data);
        extracted += 1;

        // 类 Unix 下保留 zip 携带的可执行位
        if (process.platform !== "win32") {
            const unixMode = (entry.attr >>> 16) & 0xffff;
            const permissions = unixMode & 0o777;
            if (permissions > 0) {
                await fs.chmod(dest, permissions).catch(() => undefined);
            }
        }

        opts.onEntry?.(safeRelative, data.length);
    }

    if (extracted === 0) {
        throw new Error(
            `归档内没有可解压文件（stripPrefix 可能不正确）：${opts.archivePath}`,
        );
    }
}

async function extractTar(opts: ExtractOptions): Promise<void> {
    const strip =
        opts.stripComponents ?? prefixDepth(opts.stripPrefix) ?? 0;

    let fileCount = 0;
    await tar.x({
        file: opts.archivePath,
        cwd: opts.targetDir,
        strip,
        // `filter` 的 entry 类型在 node-tar 的类型声明中是 `ReadEntry | Stats`
        // （同一声明兼顾 create 与 extract）。extract 场景下运行时一定是
        // ReadEntry，此处做显式断言以通过编译。
        filter: (path, entry) => {
            const readEntry = entry as tar.ReadEntry;
            if (readEntry.type === "Link" || readEntry.type === "SymbolicLink") {
                Logger.warn(`[Archive] 跳过 link 条目：${path}`);
                return false;
            }
            return true;
        },
        onwarn: (code, message) => {
            Logger.warn(`[Archive] tar ${code}: ${message}`);
        },
        onReadEntry: (entry) => {
            // 同 filter 的类型收窄理由。
            const readEntry = entry as tar.ReadEntry;
            if (readEntry.type === "Directory") return;
            fileCount += 1;

            if (!opts.onEntry) return;

            const stripped = stripLeading(
                normalizeArchiveName(readEntry.path),
                strip,
            );
            if (!stripped) return;

            const rel = safeArchiveRelativeName(stripped) ?? stripped;
            const size =
                typeof readEntry.size === "number" ? readEntry.size : 0;
            opts.onEntry(rel, size);
        },
        // 一味 strict 会把非致命 warning 也当 error，误伤正常归档。
        strict: false,
    });

    if (fileCount === 0) {
        throw new Error(`归档内没有可解压文件：${opts.archivePath}`);
    }
}

// ─── 列表 / 查找（跨格式） ────────────────────────────────

export interface ArchiveEntry {
    /** POSIX 归一化后的相对路径（未剥离 stripPrefix；由调用方决定如何处理） */
    path: string;
    isDirectory: boolean;
    size: number;
    /** 读取完整内容；tar 场景下需要整包一次读完（在 `listArchiveEntries` 阶段已缓存）。 */
    read(): Promise<Buffer>;
}

/** 统一列出归档条目。 */
export async function listArchiveEntries(
    archivePath: string,
    opts: { signal?: AbortSignal } = {},
): Promise<ArchiveEntry[]> {
    const kind = detectArchiveKind(archivePath);
    if (kind === "unsupported") {
        throw new Error(
            `不支持的归档格式：${archivePath}。` +
            `目前支持 .zip / .tar / .tar.gz / .tgz。`,
        );
    }
    if (opts.signal?.aborted) {
        throw new Error(`列出已取消：${archivePath}`);
    }
    if (isZipKind(kind)) return listZipEntries(archivePath);
    return listTarEntries(archivePath);
}

async function listZipEntries(archivePath: string): Promise<ArchiveEntry[]> {
    const zip = new AdmZip(archivePath);
    const entries: ArchiveEntry[] = [];
    for (const entry of zip.getEntries()) {
        const path = normalizeArchiveName(entry.entryName);
        const isDir = entry.isDirectory;
        const size = isDir ? 0 : entry.header.size;
        entries.push({
            path,
            isDirectory: isDir,
            size: typeof size === "number" ? size : 0,
            read: async () => (isDir ? Buffer.alloc(0) : entry.getData()),
        });
    }
    return entries;
}

async function listTarEntries(archivePath: string): Promise<ArchiveEntry[]> {
    const entries: ArchiveEntry[] = [];
    await tar.t({
        file: archivePath,
        noResume: true,
        strict: false,
        onReadEntry: (entry) => {
            const readEntry = entry as tar.ReadEntry;
            const path = normalizeArchiveName(readEntry.path);
            const isDir = readEntry.type === "Directory";
            const size =
                typeof readEntry.size === "number" ? readEntry.size : 0;

            if (isDir) {
                entries.push({
                    path,
                    isDirectory: true,
                    size: 0,
                    read: async () => Buffer.alloc(0),
                });
                readEntry.resume();
                return;
            }

            const buffers: Buffer[] = [];
            // 先挂 data 监听再 resume，避免丢数据。
            readEntry.on("data", (chunk: Buffer | Uint8Array) => {
                buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            readEntry.resume();

            entries.push({
                path,
                isDirectory: false,
                size,
                read: async () => Buffer.concat(buffers),
            });
        },
    });
    return entries;
}

function pathDepth(p: string): number {
    return normalizeArchiveName(p).split("/").filter(Boolean).length;
}

/**
 * 跨格式查找层级最浅的目标文件。
 *
 * 用于 SKILL.md / meta.json 这类入口文件；如果归档内存在多个，
 * 选择层级最浅的一个，避免误选 references/examples 中的同名文件。
 */
export async function findShallowestFile(
    archivePath: string,
    fileName: string,
): Promise<ArchiveEntry | null> {
    const entries = await listArchiveEntries(archivePath);
    const target = fileName.toLowerCase();
    const matches = entries
        .filter(
            (e) =>
                !e.isDirectory &&
                posix.basename(e.path).toLowerCase() === target,
        )
        .sort((a, b) => pathDepth(a.path) - pathDepth(b.path));
    return matches[0] ?? null;
}