// packages/main/src/libs/loader/archive.ts
//
// 统一压缩包接口：根据后缀自动选择 zip（adm-zip）或 tar（node-tar）。
//
// 支持的格式：.zip / .tar / .tar.gz / .tgz / .tar.bz2 / .bz2
//
// 安全（与 zip.ts 保持一致）：
//   - 路径统一按 POSIX 处理；
//   - 拒绝路径穿越、绝对路径、Windows 盘符与控制字符；
//   - tar 侧默认跳过硬链接 / 符号链接；
//   - 通过 `allowSymlinks: true` 可显式放行 `SymbolicLink` 条目（供需要
//     官方符号链接的运行时使用，例如 Node.js Unix tar.gz 的 `bin/npm`）。
//     硬链接 **始终被拒绝**：本仓内所有官方归档都不含硬链接，放开没有收益、
//     却会把 target 的解析语义带给调用方；
//   - 放行符号链接时，本文件会独立做一层 "从 strip 后位置解析 target 是否
//     逃逸" 的防御校验，与 node-tar `preservePaths=false` 的防护互补，
//     任一侧判定逃逸即拒绝该条目。
//
// 兼容方案：
//   - 本文件是**新统一入口**，建议新代码优先使用；
//   - `zip.ts` 保留为向后兼容 shim（zip 专用 API + re-export 通用工具）。
//
// 注：zip 侧的符号链接需要解析 `extra field 0x000d`，AdmZip 不支持该
// 语义；`allowSymlinks` 对 zip 归档无影响（符号链接条目会被忽略）。

import unbzip2Stream from "@openpgp/unbzip2-stream";
import AdmZip from "adm-zip";
import Logger from "electron-log/main.js";
import { ensureDir } from "fs-extra";
import {
    createReadStream,
    createWriteStream,
    promises as fs,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import * as tar from "tar";

type WebReadableStream = NodeReadableStream<Uint8Array>;

const SUPPORTED_ARCHIVE_HINT =
    ".zip / .tar / .tar.gz / .tgz / .tar.bz2 / .bz2";

// ─── 路径安全工具 ─────────────────────────────────────────

function normalizeArchiveName(name: string): string {
    return name.replace(/\\/g, "/");
}

function normalizeArchiveEntryName(name: string): string {
    return normalizeArchiveName(name)
        .replace(/^\.\/+/, "")
        .replace(/^\/+/, "");
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

function stripPathPrefix(
    relative: string,
    prefix: string,
): string | null {
    const normalizedRelative = normalizeArchiveEntryName(relative);
    const normalizedPrefix = normalizeArchiveEntryName(prefix).replace(
        /\/+$/,
        "",
    );

    if (!normalizedPrefix || normalizedPrefix === ".") {
        return normalizedRelative;
    }
    if (normalizedRelative === normalizedPrefix) {
        return null;
    }
    if (!normalizedRelative.startsWith(`${normalizedPrefix}/`)) {
        return null;
    }
    return normalizedRelative.slice(normalizedPrefix.length + 1);
}

// ─── 归档类型识别 ─────────────────────────────────────────

export type ArchiveKind =
    | "zip"
    | "tar"
    | "tar.gz"
    | "tgz"
    | "tar.bz2"
    | "bz2"
    | "unsupported";

export function detectArchiveKind(filePath: string): ArchiveKind {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".tar.bz2")) return "tar.bz2";
    if (lower.endsWith(".zip")) return "zip";
    if (lower.endsWith(".tar.gz")) return "tar.gz";
    if (lower.endsWith(".tgz")) return "tgz";
    if (lower.endsWith(".tar")) return "tar";
    if (lower.endsWith(".bz2")) return "bz2";
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
    /**
     * 是否允许解压 tar 归档中的**符号链接**。
     *
     * - 默认 false（保持通用安全策略：跳过链接）；
     * - true 时 `SymbolicLink` 条目被放行，由 node-tar 正确创建链接；
     *   本实现额外做一层 "从 strip 后位置解析 target 是否逃逸" 的防御。
     * - **硬链接始终被拒绝**，不受本参数影响。
     * - zip 归档不受本参数影响（AdmZip 不解析符号链接）。
     */
    allowSymlinks?: boolean;
    /** 每个成功解压的条目回调（符号链接不触发，避免误导） */
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
            `目前支持 ${SUPPORTED_ARCHIVE_HINT}。`,
        );
    }
    await ensureDir(opts.targetDir);
    if (opts.signal?.aborted) {
        throw new Error(`解压已取消：${opts.archivePath}`);
    }
    if (isZipKind(kind)) return extractZip(opts);
    if (kind === "bz2") return extractBz2(opts);
    if (kind === "tar.bz2") {
        await withDecompressedTarFile(
            opts.archivePath,
            opts.signal,
            (tarPath) => extractTar({ ...opts, archivePath: tarPath }),
        );
        return;
    }
    return extractTar(opts);
}

function prefixDepth(prefix: string | undefined): number | undefined {
    if (!prefix) return undefined;
    const normalized = posix
        .normalize(normalizeArchiveName(prefix))
        .replace(/^\/+|\/+$/g, "");
    if (!normalized || normalized === ".") return undefined;
    const depth = normalized.split("/").filter(Boolean).length;
    return depth > 0 ? depth : undefined;
}

function stripLeading(p: string, n: number): string | null {
    if (n <= 0) return p;
    const normalized = posix
        .normalize(normalizeArchiveName(p))
        .replace(/^\/+/, "");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= n) return null;
    return parts.slice(n).join("/");
}

async function extractZip(opts: ExtractOptions): Promise<void> {
    const zip = new AdmZip(opts.archivePath);
    const stripComponents = opts.stripComponents ?? 0;

    let extracted = 0;
    for (const entry of zip.getEntries()) {
        if (opts.signal?.aborted) {
            throw new Error(`解压已取消：${opts.archivePath}`);
        }
        if (entry.isDirectory) continue;

        let relative = stripPathPrefix(
            entry.entryName,
            opts.stripPrefix ?? "",
        );
        if (relative === null) continue;

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

function bz2EntryName(archivePath: string): string {
    const base = posix.basename(normalizeArchiveName(archivePath));
    const stripped = base.replace(/\.bz2$/i, "");
    return stripped && stripped !== "." && stripped !== ".."
        ? stripped
        : "decompressed";
}

function createBz2Readable(
    archivePath: string,
    signal?: AbortSignal,
): Readable {
    const source = createReadStream(archivePath);

    let webDecompressed: WebReadableStream | undefined;
    let decompressed: Readable;
    try {
        const webSource = Readable.toWeb(source) as unknown as WebReadableStream;
        webDecompressed = unbzip2Stream(webSource);
        decompressed = Readable.fromWeb(webDecompressed);
    } catch (err) {
        // 构造阶段抛错：此时还没有句柄交给调用方，必须在此处关闭。
        // - cancel() 会触发 unbzip2Stream 的 inputReader.abort → 取消 webSource；
        // - source.destroy() 兜底释放底层 fd（toWeb 是双向绑定，幂等）。
        webDecompressed?.cancel().catch(() => undefined);
        source.destroy();
        throw err;
    }

    if (signal) {
        const onAbort = () => {
            // ⚠️ 用无参 destroy()：传 Error 会 emit 'error'，此刻
            // decompressed 上还没有任何 'error' 监听器，会 uncaughtException。
            decompressed.destroy();
            // 兜底：正常情况下 destroy() 会通过 cancel 链传播到 source，
            // 但 Node 各版本 fromWeb._destroy 实现有细微差异，双保险无副作用。
            source.destroy();
        };

        if (signal.aborted) {
            onAbort();
            throw new Error(`解压已取消：${archivePath}`);
        }

        signal.addEventListener("abort", onAbort, { once: true });
        const cleanup = () => signal.removeEventListener("abort", onAbort);
        decompressed.once("close", cleanup);
        decompressed.once("error", cleanup);
    }

    return decompressed;
}

async function decompressBz2ToBuffer(
    archivePath: string,
    signal?: AbortSignal,
): Promise<Buffer> {
    const readable = createBz2Readable(archivePath, signal);
    const chunks: Buffer[] = [];

    try {
        for await (const chunk of readable) {
            chunks.push(
                Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk as Uint8Array),
            );
        }
    } finally {
        readable.destroy();
    }

    return Buffer.concat(chunks);
}

async function decompressBz2ToFile(
    archivePath: string,
    destPath: string,
    signal?: AbortSignal,
): Promise<void> {
    await ensureDir(dirname(destPath));
    const readable = createBz2Readable(archivePath, signal);
    await pipeline(readable, createWriteStream(destPath));
}

async function withDecompressedTarFile<T>(
    archivePath: string,
    signal: AbortSignal | undefined,
    fn: (tarPath: string) => Promise<T>,
): Promise<T> {
    const dir = await fs.mkdtemp(join(tmpdir(), "loader-bz2-"));
    const tarPath = join(dir, "archive.tar");

    try {
        await decompressBz2ToFile(archivePath, tarPath, signal);
        return await fn(tarPath);
    } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(
            () => undefined,
        );
    }
}

async function extractBz2(opts: ExtractOptions): Promise<void> {
    let relative = bz2EntryName(opts.archivePath);

    const prefixed = stripPathPrefix(
        relative,
        opts.stripPrefix ?? "",
    );
    if (prefixed === null) {
        throw new Error(
            `归档内没有可解压文件（stripPrefix 可能不正确）：${opts.archivePath}`,
        );
    }
    relative = prefixed;

    const stripComponents = opts.stripComponents ?? 0;
    if (stripComponents > 0) {
        const stripped = stripLeading(relative, stripComponents);
        if (!stripped) {
            throw new Error(
                `归档内没有可解压文件（stripComponents 过大）：${opts.archivePath}`,
            );
        }
        relative = stripped;
    }

    const safeRelative = safeArchiveRelativeName(relative);
    if (!safeRelative) {
        throw new Error(`归档条目路径非法：${relative}`);
    }

    const dest = join(opts.targetDir, safeRelative);
    await decompressBz2ToFile(opts.archivePath, dest, opts.signal);

    const fileStat = await fs.stat(dest);
    opts.onEntry?.(safeRelative, fileStat.size);
}

/**
 * 计算符号链接 target 是否逃逸出解压根目录。
 *
 * 语义：给定 **strip 后**的符号链接条目路径（entryPath），符号链接
 * target（linkpath）按 POSIX 规则相对于链接所在**目录**解析；解析结果
 * 必须以归档根为基准的**相对路径**表达，不含逃逸段（`..` / 绝对路径）。
 *
 * 返回 null 表示安全（resolved 相对路径）；否则返回原因字符串。
 *
 * 设计取舍：与 node-tar 自带防护独立实现，任一侧判定逃逸即拒绝。
 * 这样的好处是：
 *   - 不依赖 node-tar 内部实现细节（不同版本行为可能有差异）；
 *   - 逃逸判定逻辑在本文件内可读、可测。
 */
function checkSymlinkTarget(
    entryPath: string,
    linkpath: string,
): string | null {
    if (!linkpath) return "linkpath 为空";
    if (linkpath.startsWith("/")) return "linkpath 为绝对路径";
    if (/^[a-zA-Z]:/.test(linkpath)) return "linkpath 含盘符";
    if (containsControlChar(linkpath)) return "linkpath 含控制字符";

    const linkDir = posix.dirname(
        posix.normalize(normalizeArchiveName(entryPath)),
    );
    const resolved = posix.normalize(posix.join(linkDir, linkpath));

    if (
        resolved === "." ||
        resolved === ".." ||
        resolved.startsWith("../") ||
        resolved.startsWith("/")
    ) {
        return `target 逃逸（解析为 ${resolved}）`;
    }
    return null;
}

async function extractTar(opts: ExtractOptions): Promise<void> {
    const strip =
        opts.stripComponents ?? prefixDepth(opts.stripPrefix) ?? 0;
    const allowSymlinks = opts.allowSymlinks === true;

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

            // 硬链接：本仓内所有官方归档均不使用；保持拒绝使攻击面最小化。
            // （硬链接 target 相对于归档根，语义与符号链接不同，安全校验
            // 也更复杂；没有真实用例之前不为它引入复杂度。）
            if (readEntry.type === "Link") {
                Logger.warn(`[Archive] 跳过 hard link 条目：${path}`);
                return false;
            }

            if (readEntry.type === "SymbolicLink") {
                if (!allowSymlinks) {
                    Logger.warn(`[Archive] 跳过 symbol link 条目：${path}`);
                    return false;
                }

                const linkpath = readEntry.linkpath;
                if (typeof linkpath !== "string") {
                    Logger.warn(
                        `[Archive] 跳过缺少 linkpath 的 symbol link：${path}`,
                    );
                    return false;
                }

                // `filter` 在 strip 之前调用；为了按"最终落点"判断逃逸，
                // 这里显式执行一次 strip。strip 深度不足时 node-tar 会在
                // 后续 CHECKPATH 阶段 skip 该条目，本层可放行。
                const stripped = stripLeading(
                    normalizeArchiveName(path),
                    strip,
                );
                if (stripped) {
                    const reason = checkSymlinkTarget(stripped, linkpath);
                    if (reason) {
                        Logger.warn(
                            `[Archive] 跳过 symbol link：${path} -> ${linkpath}（${reason}）`,
                        );
                        return false;
                    }
                }
            }

            return true;
        },
        onwarn: (code, message) => {
            Logger.warn(`[Archive] tar ${code}: ${message}`);
        },
        onReadEntry: (entry) => {
            const readEntry = entry as tar.ReadEntry;
            if (readEntry.type === "Directory") return;

            const isHardLink = readEntry.type === "Link";
            const isSymLink = readEntry.type === "SymbolicLink";

            // 与 filter 保持一致：被跳过的链接不应计入 fileCount。
            // onReadEntry 与 filter 的调用顺序在 node-tar 版本间可能不同，
            // 这里显式再判断一次以避免把"被跳过的条目"计入。
            if (isHardLink) return;
            if (isSymLink && !allowSymlinks) return;

            fileCount += 1;

            // 链接条目不算"解压文件"，跳过 onEntry 回调，避免误导调用方。
            if (isSymLink) return;

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
            `目前支持 ${SUPPORTED_ARCHIVE_HINT}。`,
        );
    }
    if (opts.signal?.aborted) {
        throw new Error(`列出已取消：${archivePath}`);
    }
    if (isZipKind(kind)) return listZipEntries(archivePath);
    if (kind === "bz2") return listBz2Entries(archivePath, opts);
    if (kind === "tar.bz2") {
        return withDecompressedTarFile(
            archivePath,
            opts.signal,
            (tarPath) => listTarEntries(tarPath),
        );
    }
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

async function listBz2Entries(
    archivePath: string,
    opts: { signal?: AbortSignal } = {},
): Promise<ArchiveEntry[]> {
    const data = await decompressBz2ToBuffer(archivePath, opts.signal);
    const path = bz2EntryName(archivePath);

    return [
        {
            path,
            isDirectory: false,
            size: data.length,
            read: async () => data,
        },
    ];
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
                buffers.push(
                    Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
                );
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