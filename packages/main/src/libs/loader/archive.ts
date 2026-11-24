// packages/main/src/libs/loader/archive.ts
//
// 统一压缩包接口：根据后缀自动选择 zip（adm-zip）、tar（node-tar）、
// bzip2（@openpgp/unbzip2-stream）、xz（xz-compat）。
//
// 支持的格式：
//   - 解压：.zip / .tar / .tar.gz / .tgz / .tar.bz2 / .tbz2 / .tbz /
//           .bz2 / .tar.xz / .txz / .xz
//   - 创建：.zip / .tar / .tar.gz / .tgz
//
// xz 说明（xz-compat）：
//   - xz-compat **只解压、不压缩**，所以 `.xz` / `.tar.xz` 只支持解压，
//     与 `.bz2` 一致；
//   - `.tar.xz` 先流式解压成临时 `.tar`，再走统一 tar 分支，内存占用与
//     压缩包体积无关（不要用 `decodeXZ` 一次读整包，几百 MB 的
//     ffmpeg 归档会直接把主进程内存打满）；
//   - 裸 `.xz` 视为单文件，解压为去掉 `.xz` 后缀的同名文件；
//   - `.7z` **不支持**：xz-compat 只提供 7z **条目**内 raw LZMA / LZMA2 的
//     解码 API（`decode7zLzma` / `decode7zLzma2`），并不解析 7z 容器
//     （容器头、编码链、文件树需要调用方自行处理）。要支持 `.7z`
//     需另引 `node-7z` / `7zip-bin` / `7z-wasm` 之类的容器实现；
//   - `.lzma`（lzma_alone 单文件）**不支持**：该格式需要先自行解析 13
//     字节头（5 字节 props + 8 字节 uncompressed size）再调 `decodeLzma`，
//     与 `.xz` / `.tar.xz` 不是同一条路径，暂不纳入，避免引入未经
//     验证的格式解析。
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
// 取消（AbortSignal）：
//   - zip：逐条目检查，在条目边界中止；
//   - tar：node-tar **没有** AbortSignal 支持，因此通过 `filter`
//     （每个条目被处理前同步调用）抛出 AbortError 截停；抛出的错误会让
//     `tar.x` 的 Promise reject。不同版本的 node-tar 对 filter 异常的
//     处理并不一致（个别版本会降级为 warn 后继续），因此额外在
//     `catch` 与函数末尾各做一次兜底检查，保证信号中止的调用最终
//     一定以 AbortError 结束；
//   - bz2 / tar.bz2：解压流在 abort 时被 destroy，`pipeline` 随即失败；
//     临时目录在 finally 中清理；
//   - xz / tar.xz：`pipeline` 原生 `{ signal }` 在 abort 时销毁整条流，
//     随后本文件把取消翻译成统一的 AbortError（不依赖 Node 的错误文案）；
//     临时目录同样在 finally 中清理。
//
// 兼容方案：
//   - 本文件是**新统一入口**，建议新代码优先使用；
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
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import * as tar from "tar";

type WebReadableStream = NodeReadableStream<Uint8Array>;

const SUPPORTED_ARCHIVE_HINT =
    ".zip / .tar / .tar.gz / .tgz / .tar.bz2 / .tbz2 / .tbz / .bz2 / " +
    ".tar.xz / .txz / .xz";

// ─── 取消辅助 ─────────────────────────────────────────────

/**
 * 构造标准化的取消错误。
 *
 * `name = "AbortError"` 让调用方（CodeRuntimeManager）可以不依赖文案
 * 识别"这次失败是取消"，与 `loader/downloader.ts` 保持一致。
 */
function makeAbortError(message: string): Error {
    const err = new Error(message);
    err.name = "AbortError";
    return err;
}

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
    | "tar.xz"
    | "tar.bz2"
    | "bz2"
    | "xz"
    | "unsupported";

export function detectArchiveKind(filePath: string): ArchiveKind {
    const lower = filePath.toLowerCase();
    // 组合后缀必须先判断：`.tar` 不会出现在 `.tar.xz` 末尾，但顺序统一
    // 按"最长后缀优先"排列，便于后续新增格式时不需要重新排。
    if (
        lower.endsWith(".tar.bz2") ||
        lower.endsWith(".tbz2") ||
        lower.endsWith(".tbz")
    ) {
        return "tar.bz2";
    }
    if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) return "tar.xz";
    if (lower.endsWith(".zip")) return "zip";
    if (lower.endsWith(".tar.gz")) return "tar.gz";
    if (lower.endsWith(".tgz")) return "tgz";
    if (lower.endsWith(".tar")) return "tar";
    if (lower.endsWith(".bz2")) return "bz2";
    if (lower.endsWith(".xz")) return "xz";
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
    /**
     * 取消信号。
     *
     * 语义：尽量在**条目边界**中止，已经解压出来的文件不会被回滚；
     * 调用方（例如 CodeRuntimeManager）负责清理目标目录。
     */
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
    // 先检查中止再创建目录：否则取消后仍会在磁盘上留下空目录。
    if (opts.signal?.aborted) {
        throw makeAbortError(`解压已取消：${opts.archivePath}`);
    }
    await ensureDir(opts.targetDir);

    if (isZipKind(kind)) return extractZip(opts);
    if (kind === "bz2") {
        await extractSingleFile(
            opts,
            singleFileEntryName(opts.archivePath, /\.bz2$/i),
            decompressBz2ToFile,
        );
        return;
    }
    if (kind === "xz") {
        await extractSingleFile(
            opts,
            singleFileEntryName(opts.archivePath, /\.xz$/i),
            decompressXzToFile,
        );
        return;
    }
    if (kind === "tar.bz2") {
        await withDecompressedTarFile(
            opts.archivePath,
            opts.signal,
            decompressBz2ToFile,
            (tarPath) => extractTar({ ...opts, archivePath: tarPath }),
        );
        return;
    }
    if (kind === "tar.xz") {
        await withDecompressedTarFile(
            opts.archivePath,
            opts.signal,
            decompressXzToFile,
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
            throw makeAbortError(`解压已取消：${opts.archivePath}`);
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

/**
 * 单文件归档（`.bz2` / `.xz`）的解压产物名：去掉压缩后缀的 basename。
 *
 * 后缀剥离后为空、`.` 或 `..` 时回退为 `decompressed`，避免产生
 * 无意义或非法的路径（例如文件名恰好叫 `.xz`）。
 */
function singleFileEntryName(archivePath: string, suffix: RegExp): string {
    const base = posix.basename(normalizeArchiveName(archivePath));
    const stripped = base.replace(suffix, "");
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
            throw makeAbortError(`解压已取消：${archivePath}`);
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
    if (signal?.aborted) {
        throw makeAbortError(`解压已取消：${archivePath}`);
    }
    const readable = createBz2Readable(archivePath, signal);
    await pipeline(readable, createWriteStream(destPath));
}

// ─── xz 解压（xz-compat） ─────────────────────────────────

type XzCompatModule = typeof import("xz-compat");

let xzCompatPromise: Promise<XzCompatModule> | undefined;

/**
 * 懒加载 xz-compat。
 *
 * 两个原因：
 *   1. xz-compat 在加载时**可能尝试动态安装** `lzma-native` 原生模块。
 *      主进程启动时已设置 `LZMA_NATIVE_DISABLE=1`，但本文件可能在更早
 *      的导入链里被顶层加载（例如被某个模块 `import`）。把真实的
 *      `import()` 推迟到首次解压时，能保证 env 一定已生效；这里再做
 *      一次幂等兜底，防止 loader 被独立使用（测试 / 脚本）时漏掉。
 *   2. 只处理 zip / tar 的调用方不必在启动阶段付一次加载成本。
 */
function loadXzModule(): Promise<XzCompatModule> {
    if (!xzCompatPromise) {
        if (!process.env.LZMA_NATIVE_DISABLE) {
            process.env.LZMA_NATIVE_DISABLE = "1";
        }
        xzCompatPromise = import("xz-compat");
    }
    return xzCompatPromise;
}

/**
 * 流水线式解压 xz → 任意 Writable。
 *
 * 使用 `pipeline` 原生的 `{ signal }`（Node 15+）：abort 时会按序销毁
 * source / decoder / destination 并 reject。相比手动挂监听，省掉了
 * "source 的 error 没有传播给 decoder" 这类坑。
 *
 * 取消统一翻译成 `makeAbortError`，让上层不依赖 Node 的错误文案。
 */
async function runXzPipeline(
    archivePath: string,
    destination: Writable,
    signal?: AbortSignal,
): Promise<void> {
    const { createXZDecoder } = await loadXzModule();
    // 文档示例为 `readStream.pipe(createXZDecoder()).pipe(writeStream)`，
    // 说明其返回的是标准 Node Transform；类型声明未暴露细化类型，
    // 这里显式断言以匹配 pipeline 的重载。
    const decoder = createXZDecoder() as unknown as Transform;

    try {
        const source = createReadStream(archivePath);
        if (signal) {
            await pipeline(source, decoder, destination, { signal });
        } else {
            await pipeline(source, decoder, destination);
        }
    } catch (err) {
        if (signal?.aborted) {
            throw makeAbortError(`解压已取消：${archivePath}`);
        }
        throw err;
    }
}

async function decompressXzToFile(
    archivePath: string,
    destPath: string,
    signal?: AbortSignal,
): Promise<void> {
    await ensureDir(dirname(destPath));
    if (signal?.aborted) {
        throw makeAbortError(`解压已取消：${archivePath}`);
    }
    await runXzPipeline(archivePath, createWriteStream(destPath), signal);
}

async function decompressXzToBuffer(
    archivePath: string,
    signal?: AbortSignal,
): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const sink = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(
                Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk as Uint8Array),
            );
            callback();
        },
    });

    await runXzPipeline(archivePath, sink, signal);
    return Buffer.concat(chunks);
}

// ─── 组合归档（tar.bz2 / tar.xz） ─────────────────────────

type DecompressToFile = (
    archivePath: string,
    destPath: string,
    signal?: AbortSignal,
) => Promise<void>;

type DecompressToBuffer = (
    archivePath: string,
    signal?: AbortSignal,
) => Promise<Buffer>;

async function withDecompressedTarFile<T>(
    archivePath: string,
    signal: AbortSignal | undefined,
    decompress: DecompressToFile,
    fn: (tarPath: string) => Promise<T>,
): Promise<T> {
    const dir = await fs.mkdtemp(join(tmpdir(), "loader-tar-"));
    const tarPath = join(dir, "archive.tar");

    try {
        await decompress(archivePath, tarPath, signal);
        return await fn(tarPath);
    } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(
            () => undefined,
        );
    }
}

async function extractSingleFile(
    opts: ExtractOptions,
    entryName: string,
    decompress: DecompressToFile,
): Promise<void> {
    let relative = entryName;

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
    await decompress(opts.archivePath, dest, opts.signal);

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

    /**
     * 条目边界上的取消检查。
     *
     * node-tar **没有** AbortSignal 支持（`tar.x` 的选项里也没有
     * signal / abort）。`filter` 与 `onReadEntry` 是唯二会在每个条目上
     * 被同步调用的钩子，从它们抛出错误会使 `tar.x` 的 Promise reject。
     */
    const ensureActive = () => {
        if (opts.signal?.aborted) {
            throw makeAbortError(`解压已取消：${opts.archivePath}`);
        }
    };

    let fileCount = 0;
    try {
        await tar.x({
            file: opts.archivePath,
            cwd: opts.targetDir,
            strip,
            // `filter` 的 entry 类型在 node-tar 的类型声明中是 `ReadEntry | Stats`
            // （同一声明兼顾 create 与 extract）。extract 场景下运行时一定是
            // ReadEntry，此处做显式断言以通过编译。
            filter: (path, entry) => {
                ensureActive();

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
                // 兜底：`filter` 已在上游对每个条目调用；但个别条目的
                // filter 结果可能被 node-tar 内部路径跳过（例如 strip
                // 深度不足），这里在真正读取条目数据前再检查一次，
                // 保证取消不会漏过任何已进入读取阶段的条目。
                ensureActive();

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
    } catch (error) {
        // 兜底：不同 node-tar 版本对 filter 抛错的处理不一致 —— 有的
        // 会 reject，有的会降级为 warn 后继续处理剩余条目。只要信号
        // 已中止，就以取消语义结束，不要把手上的非 abort 错误上抛给
        // 调用方（否则 manager 的取消分支会错过"是用户取消"的事实）。
        ensureActive();
        throw error;
    }

    // 双保险：归档为空 / filter 从未被调用时，上面的检查不会触发。
    ensureActive();

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
        throw makeAbortError(`列出已取消：${archivePath}`);
    }
    if (isZipKind(kind)) return listZipEntries(archivePath);
    if (kind === "bz2") {
        return listSingleFileEntries(
            archivePath,
            singleFileEntryName(archivePath, /\.bz2$/i),
            decompressBz2ToBuffer,
            opts,
        );
    }
    if (kind === "xz") {
        return listSingleFileEntries(
            archivePath,
            singleFileEntryName(archivePath, /\.xz$/i),
            decompressXzToBuffer,
            opts,
        );
    }
    if (kind === "tar.bz2") {
        return withDecompressedTarFile(
            archivePath,
            opts.signal,
            decompressBz2ToFile,
            (tarPath) => listTarEntries(tarPath),
        );
    }
    if (kind === "tar.xz") {
        return withDecompressedTarFile(
            archivePath,
            opts.signal,
            decompressXzToFile,
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

async function listSingleFileEntries(
    archivePath: string,
    entryName: string,
    decompressToBuffer: DecompressToBuffer,
    opts: { signal?: AbortSignal } = {},
): Promise<ArchiveEntry[]> {
    const data = await decompressToBuffer(archivePath, opts.signal);

    return [
        {
            path: entryName,
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

export interface CreateArchiveOptions {
    /** 输出归档文件路径（绝对路径）。 */
    outputPath: string;
    /** 源文件或源目录（绝对路径）。 */
    sourcePath: string;
    /** 取消信号。 */
    signal?: AbortSignal;
    /** 每个成功写入条目的回调。 */
    onEntry?: (relativePath: string, bytes?: number) => void;
}

export interface CreateArchiveResult {
    outputPath: string;
    kind: Extract<ArchiveKind, "zip" | "tar" | "tar.gz" | "tgz">;
    entryCount: number;
}

/**
 * 创建归档。
 *
 * 支持 .zip / .tar / .tar.gz / .tgz。
 * .tar.bz2 / .bz2 / .tar.xz / .xz 均不支持创建：
 *   - Node 无内置 bzip2 编码器；
 *   - xz-compat 明确只提供解压（“This package decompresses; it does not
 *     create XZ or LZMA archives”），要生成 xz 需依赖系统 `xz` 命令或
 *     另引编码器实现。
 *
 * 安全约束：
 * - 输出文件不能位于源目录内部（避免把正在写入的归档包含进自身）；
 * - 归档内路径统一使用 POSIX 相对路径；
 * - tar 侧不跟随符号链接。
 */
export async function createArchive(
    opts: CreateArchiveOptions,
): Promise<CreateArchiveResult> {
    const kind = detectArchiveKind(opts.outputPath);
    if (
        kind === "unsupported" ||
        kind === "tar.bz2" ||
        kind === "bz2" ||
        kind === "tar.xz" ||
        kind === "xz"
    ) {
        throw new Error(
            `不支持的归档格式：${opts.outputPath}。` +
            `创建归档支持 .zip / .tar / .tar.gz / .tgz。`,
        );
    }

    if (opts.signal?.aborted) {
        throw makeAbortError(`创建归档已取消：${opts.outputPath}`);
    }

    await ensureDir(dirname(opts.outputPath));

    const srcStat = await fs.stat(opts.sourcePath);
    if (srcStat.isDirectory()) {
        const rel = relative(opts.sourcePath, opts.outputPath);
        if (
            rel === "" ||
            (!rel.startsWith(`..${sep}`) && !isAbsolute(rel))
        ) {
            throw new Error(
                `归档输出文件不能位于源目录内部: ${opts.outputPath}`,
            );
        }
    }

    if (kind === "zip") {
        return createZipArchive(opts);
    }

    return createTarArchive(opts, kind, srcStat.isDirectory());
}

async function createZipArchive(
    opts: CreateArchiveOptions,
): Promise<CreateArchiveResult> {
    // 延迟导入，避免顶层循环依赖
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();

    const srcStat = await fs.stat(opts.sourcePath);
    if (srcStat.isDirectory()) {
        zip.addLocalFolder(opts.sourcePath, "");
    } else {
        zip.addLocalFile(opts.sourcePath, "");
    }

    const bytes = zip.toBuffer();
    await fs.writeFile(opts.outputPath, bytes);

    const entryCount = zip.getEntries().length;
    opts.onEntry?.(
        srcStat.isDirectory() ? "." : basename(opts.sourcePath),
        bytes.length,
    );

    return {
        outputPath: opts.outputPath,
        kind: "zip",
        entryCount,
    };
}

async function createTarArchive(
    opts: CreateArchiveOptions,
    kind: Extract<ArchiveKind, "tar" | "tar.gz" | "tgz">,
    sourceIsDirectory: boolean,
): Promise<CreateArchiveResult> {
    // 延迟导入，避免顶层循环依赖
    const tar = await import("tar");

    const cwd = sourceIsDirectory
        ? opts.sourcePath
        : dirname(opts.sourcePath);
    const entries = sourceIsDirectory
        ? ["."]
        : [basename(opts.sourcePath)];

    const gzip = kind === "tar.gz" || kind === "tgz";

    let entryCount = 0;

    await tar.c(
        {
            file: opts.outputPath,
            cwd,
            gzip,
            filter: (entryPath: string, entry: { size?: number }) => {
                if (opts.signal?.aborted) {
                    throw makeAbortError(
                        `创建归档已取消：${opts.outputPath}`,
                    );
                }

                // 防止把输出文件自身打进源目录
                const abs = join(cwd, entryPath);
                if (abs === opts.outputPath) {
                    return false;
                }

                entryCount += 1;
                opts.onEntry?.(entryPath, entry.size ?? 0);
                return true;
            },
        },
        entries,
    );

    if (entryCount === 0) {
        throw new Error(
            `归档内没有可压缩文件：${opts.sourcePath}`,
        );
    }

    return {
        outputPath: opts.outputPath,
        kind,
        entryCount,
    };
}