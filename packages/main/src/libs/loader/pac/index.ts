import { throwUnprcessable } from "$libs/utils/err.js";
import type { PacFileDocument, PacNode } from "$types/shared/api/pac.js";
import matter from "@11ty/gray-matter";
import fg, { type Entry, type Options } from "fast-glob";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export {
    pacFileDocumentSchema,
    pacNodeSchema
} from "$types/shared/api/pac.js";
export type { PacFileDocument, PacNode } from "$types/shared/api/pac.js";

const MD_EXT = ".md";
const MAX_NAME_LENGTH = 100;
const WINDOWS_ILLEGAL_RE = /[<>:"/\\|?*]/;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const GLOB_IGNORE = ["**/node_modules/**", "**/.git/**"];

function resolveRootAbs(root: string): string {
    if (!path.isAbsolute(root)) {
        throwUnprcessable("PAC 根目录必须是绝对路径");
    }
    return path.resolve(root);
}

function toApiPath(rel: string): string {
    return rel ? `/${rel}` : "/";
}

function dirnameRel(rel: string): string {
    const dir = path.posix.dirname(rel);
    return dir === "." ? "" : dir;
}

function joinRel(parent: string, name: string): string {
    return parent ? `${parent}/${name}` : name;
}

function normalizeGlobPath(value: string): string {
    return value.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function isInside(parent: string, child: string): boolean {
    const rel = path.relative(parent, child);
    return (
        rel === "" ||
        (rel !== ".." &&
            !rel.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(rel))
    );
}

function hasControlChar(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

function stripBom(value: string): string {
    return value.length > 0 && value.charCodeAt(0) === 0xfeff
        ? value.slice(1)
        : value;
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
    return typeof err === "object" && err !== null && "code" in err;
}

function normalizeRelPath(input: string, allowRoot: boolean): string {
    if (typeof input !== "string") {
        throwUnprcessable("路径必须是字符串");
    }

    const raw = input.replace(/\\/g, "/");
    if (hasControlChar(raw)) {
        throwUnprcessable("路径包含非法控制字符");
    }

    const withoutRoot = raw.replace(/^\/+/, "");
    if (!withoutRoot || withoutRoot === ".") {
        if (allowRoot) return "";
        throwUnprcessable("路径不能为空");
    }

    const normalized = path.posix.normalize(withoutRoot).replace(/\/+$/g, "");

    if (!normalized || normalized === ".") {
        if (allowRoot) return "";
        throwUnprcessable("路径不能为空");
    }

    if (
        normalized === ".." ||
        normalized.startsWith("../") ||
        normalized.includes("/../")
    ) {
        throwUnprcessable("路径越界");
    }

    if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
        throwUnprcessable("路径必须是 PAC 根目录内的相对路径");
    }

    return normalized;
}

function normalizeNewName(name: string): string {
    const trimmed = name.trim();

    if (!trimmed) {
        throwUnprcessable("名称不能为空");
    }

    if (trimmed === "." || trimmed === "..") {
        throwUnprcessable("名称不能为 . 或 ..");
    }

    if (trimmed.length > MAX_NAME_LENGTH) {
        throwUnprcessable(`名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
    }

    if (hasControlChar(trimmed) || WINDOWS_ILLEGAL_RE.test(trimmed)) {
        throwUnprcessable('名称不能包含 \\ / : * ? " < > | 等字符');
    }

    if (/[. ]$/.test(trimmed)) {
        throwUnprcessable("名称不能以空格或点结尾");
    }

    if (WINDOWS_RESERVED_RE.test(trimmed)) {
        throwUnprcessable("名称不能使用 Windows 保留名");
    }

    return trimmed;
}

function assertMarkdownFileName(name: string): void {
    if (!name.endsWith(MD_EXT)) {
        throwUnprcessable("PAC 文件必须使用 .md 后缀");
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function toJsonObject(value: unknown): Record<string, unknown> {
    if (value === undefined) {
        return {};
    }

    if (!isPlainObject(value)) {
        throwUnprcessable("front-matter 必须是 JSON 对象");
    }

    let jsonText: string;
    try {
        jsonText = JSON.stringify(value, (_key, item) => {
            if (item === undefined) {
                throwUnprcessable("front-matter 不支持 undefined");
            }
            if (
                typeof item === "function" ||
                typeof item === "symbol" ||
                typeof item === "bigint"
            ) {
                throwUnprcessable("front-matter 必须是可 JSON 序列化的对象");
            }
            if (typeof item === "number" && !Number.isFinite(item)) {
                throwUnprcessable("front-matter 不支持 NaN / Infinity");
            }
            return item;
        });
    } catch (err) {
        if (err instanceof Error) throw err;
        throwUnprcessable("front-matter 不是合法 JSON");
    }

    const parsed = JSON.parse(jsonText) as unknown;
    if (!isPlainObject(parsed)) {
        throwUnprcessable("front-matter 必须是 JSON 对象");
    }

    return parsed;
}

export function parsePacMarkdown(raw: string): {
    meta: Record<string, unknown>;
    content: string;
} {
    const parsed = matter(stripBom(raw));
    return {
        meta: toJsonObject(parsed.data),
        content: parsed.content,
    };
}

export function stringifyPacMarkdown(
    meta: Record<string, unknown>,
    content: string,
): string {
    if (typeof content !== "string") {
        throwUnprcessable("content 必须是字符串");
    }
    return matter.stringify(content, toJsonObject(meta));
}

async function resolvePacPath(
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
        throwUnprcessable("路径越界");
    }

    const rootReal = await fs.realpath(rootAbs);

    if (opts.mustExist) {
        let real: string;
        try {
            real = await fs.realpath(abs);
        } catch {
            throwUnprcessable(`路径不存在: ${toApiPath(rel)}`);
        }
        if (!isInside(rootReal, real)) {
            throwUnprcessable("路径越界");
        }
    } else {
        const parentAbs = path.dirname(abs);
        let parentReal: string;
        try {
            parentReal = await fs.realpath(parentAbs);
        } catch {
            throwUnprcessable(`父目录不存在: ${toApiPath(dirnameRel(rel))}`);
        }
        if (!isInside(rootReal, parentReal)) {
            throwUnprcessable("路径越界");
        }
    }

    return { abs, rel, rootAbs, rootReal };
}

async function assertDirectory(abs: string): Promise<void> {
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) {
        throwUnprcessable("目标不是文件夹");
    }
}

async function atomicWriteFile(filePath: string, data: string): Promise<void> {
    const dir = path.dirname(filePath);
    const tmp = path.join(dir, `.${path.basename(filePath)}.${randomUUID()}.tmp`);

    try {
        await fs.writeFile(tmp, data, { encoding: "utf8", flag: "wx" });
        await fs.rename(tmp, filePath);
    } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
}

function sortPacNode(node: PacNode): void {
    if (!node.children) return;

    node.children.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "zh-Hans-CN", {
            numeric: true,
            sensitivity: "base",
        });
    });

    for (const child of node.children) {
        sortPacNode(child);
    }
}

/** 构造一个空的根节点，用于目录不存在 / 不可读时降级返回。 */
function createEmptyRoot(rootAbs: string): PacNode {
    return {
        id: "root",
        name: path.basename(rootAbs) || "pac",
        type: "folder",
        path: "/",
        children: [],
    };
}

// ---------------------------------------------------------------------------
// fast-glob 类型安全封装
// ---------------------------------------------------------------------------

/**
 * 判断一个值是否符合 fast-glob 的 `Entry` 结构。
 *
 * 不依赖 `as` 强转：`"path" in value` 会将 `object` 收窄到
 * `object & Record<"path", unknown>`（TS 4.9+），随后用 `typeof` 校验。
 */
function isEntry(value: unknown): value is Entry {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    if (!("path" in value) || !("name" in value)) {
        return false;
    }
    return typeof value.path === "string" && typeof value.name === "string";
}

function isEntryArray(value: unknown): value is Entry[] {
    return Array.isArray(value) && value.every(isEntry);
}

/**
 * 强制 fast-glob 走 objectMode，并按 `Entry[]` 返回。
 *
 * - 类型层：`Options & { objectMode: true }` 命中 fast-glob 的 Entry 重载，
 *   调用方拿到的是 `Entry[]`，`entry.stats` / `entry.path` 都是强类型的。
 * - 运行时：若上游把 `objectMode: true` 误删，返回的会是 `string[]`，
 *   这里会立刻抛出带上下文的错误，避免下游 `undefined.replace`。
 */
async function globEntries(
    pattern: string,
    options: Options & { objectMode: true },
): Promise<Entry[]> {
    const result: unknown = await fg(pattern, options);
    if (!isEntryArray(result)) {
        throw new Error(
            "fast-glob 未返回 Entry[]，请检查 objectMode: true 选项是否生效",
        );
    }
    return result;
}

/**
 * 从 fast-glob 条目中安全地取出相对路径。
 *
 * 类型层要求 `Entry`；运行时再做一次 `isEntry` 校验作为兜底，
 * 防御 `globEntries` 之外的意外调用（例如未来有人绕过封装直接调 fg）。
 */
function entryPath(entry: unknown): string {
    if (!isEntry(entry)) {
        throw new Error(
            "fast-glob 返回了非 Entry 结构，请检查 objectMode: true 选项",
        );
    }
    return entry.path;
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

/**
 * 列出 PAC 文件树。
 *
 * 行为约定：
 * - 根目录不存在、不是文件夹、或读取过程中发生 ENOENT / EACCES 等
 *   文件系统错误时，**不抛异常**，而是返回 `children: []` 的空根节点。
 * - 空树通过 `root.children.length === 0` 表达，客户端无需特殊判空。
 * - 空目录（无任何 `.md` 文件）会保留在树中，其 `children` 为 `[]`。
 */
export async function listPacTree(root: string): Promise<PacNode> {
    const rootAbs = resolveRootAbs(root);

    try {
        const rootStat = await fs.stat(rootAbs);
        if (!rootStat.isDirectory()) {
            return createEmptyRoot(rootAbs);
        }
    } catch (_err) {
        // ENOENT（不存在）、EACCES（无权限）等：降级为空树，不向上抛。
        return createEmptyRoot(rootAbs);
    }

    const rootNode = createEmptyRoot(rootAbs);
    const folders = new Map<string, PacNode>([["", rootNode]]);

    const ensureFolder = (rel: string): PacNode => {
        if (!rel) return rootNode;

        const existed = folders.get(rel);
        if (existed) return existed;

        const parentRel = dirnameRel(rel);
        const parent = ensureFolder(parentRel);
        const node: PacNode = {
            id: toApiPath(rel),
            name: path.posix.basename(rel),
            type: "folder",
            path: toApiPath(rel),
            children: [],
        };

        parent.children!.push(node);
        folders.set(rel, node);
        return node;
    };

    // suppressErrors: true 让 fast-glob 在遍历中忽略 ENOENT / EACCES
    // 等文件系统错误并返回已扫描到的条目，而不是 reject。
    //
    // 两个 glob 都必须开启 objectMode: true，才能：
    // 1. 在类型层命中 fast-glob 的 Entry 重载，得到 Entry[]；
    // 2. 在运行时拿到 Entry.path / Entry.stats（而不是裸 string）。
    const [fileEntries, dirEntries] = await Promise.all([
        globEntries("**/*.md", {
            cwd: rootAbs,
            onlyFiles: true,
            objectMode: true,
            stats: true,
            dot: false,
            followSymbolicLinks: false,
            ignore: GLOB_IGNORE,
            suppressErrors: true,
        }),
        globEntries("**/*", {
            cwd: rootAbs,
            onlyDirectories: true,
            objectMode: true,
            dot: false,
            followSymbolicLinks: false,
            ignore: GLOB_IGNORE,
            suppressErrors: true,
        }),
    ]);

    // 先铺目录，保证空目录（无 .md）也能出现在树中。
    for (const entry of dirEntries) {
        const rel = normalizeGlobPath(entryPath(entry));
        if (rel) ensureFolder(rel);
    }

    for (const entry of fileEntries) {
        const rel = normalizeGlobPath(entryPath(entry));
        if (!rel.endsWith(MD_EXT)) continue;

        const parent = ensureFolder(dirnameRel(rel));
        parent.children!.push({
            id: toApiPath(rel),
            name: path.posix.basename(rel),
            type: "file",
            path: toApiPath(rel),
            updatedAt: entry.stats?.mtimeMs,
        });
    }

    sortPacNode(rootNode);

    return rootNode;
}

export async function readPacFile(
    root: string,
    apiPath: string,
): Promise<PacFileDocument> {
    const resolved = await resolvePacPath(root, apiPath, { mustExist: true });

    if (!resolved.rel.endsWith(MD_EXT)) {
        throwUnprcessable("只能读取 .md 文件");
    }

    const stat = await fs.stat(resolved.abs);
    if (!stat.isFile()) {
        throwUnprcessable("目标不是文件");
    }

    const raw = await fs.readFile(resolved.abs, "utf8");
    const { meta, content } = parsePacMarkdown(raw);

    return {
        path: toApiPath(resolved.rel),
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
        throwUnprcessable("content 必须是字符串");
    }

    const resolved = await resolvePacPath(root, apiPath, { mustExist: false });

    if (!resolved.rel) {
        throwUnprcessable("不能写入 PAC 根目录");
    }

    assertMarkdownFileName(resolved.rel);

    const existing = await fs.lstat(resolved.abs).catch(() => null);

    if (existing) {
        if (existing.isSymbolicLink()) {
            throwUnprcessable("不允许写入符号链接文件");
        }
        if (!existing.isFile()) {
            throwUnprcessable("目标不是文件");
        }

        const real = await fs.realpath(resolved.abs);
        if (!isInside(resolved.rootReal, real)) {
            throwUnprcessable("路径越界");
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

export async function createPacFile(
    root: string,
    parentPath: string,
    name: string,
): Promise<PacNode> {
    const safeName = normalizeNewName(name);
    assertMarkdownFileName(safeName);

    const parent = await resolvePacPath(root, parentPath, {
        allowRoot: true,
        mustExist: true,
    });

    await assertDirectory(parent.abs);

    const destAbs = path.join(parent.abs, safeName);
    if (!isInside(parent.rootAbs, destAbs)) {
        throwUnprcessable("路径越界");
    }

    const rel = joinRel(parent.rel, safeName);
    const raw = stringifyPacMarkdown({}, "");

    try {
        await fs.writeFile(destAbs, raw, { encoding: "utf8", flag: "wx" });
    } catch (err) {
        if (isErrnoException(err) && err.code === "EEXIST") {
            throwUnprcessable("同目录下已存在同名项");
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

    const parent = await resolvePacPath(root, parentPath, {
        allowRoot: true,
        mustExist: true,
    });

    await assertDirectory(parent.abs);

    const destAbs = path.join(parent.abs, safeName);
    if (!isInside(parent.rootAbs, destAbs)) {
        throwUnprcessable("路径越界");
    }

    const rel = joinRel(parent.rel, safeName);

    try {
        await fs.mkdir(destAbs);
    } catch (err) {
        if (isErrnoException(err) && err.code === "EEXIST") {
            throwUnprcessable("同目录下已存在同名项");
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
        throwUnprcessable("不能重命名 PAC 根目录");
    }

    const sourceStat = await fs.lstat(source.abs);
    if (sourceStat.isFile()) {
        assertMarkdownFileName(safeName);
    }

    const destRel = joinRel(dirnameRel(source.rel), safeName);
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
        throwUnprcessable("同目录下已存在同名项");
    }

    await fs.rename(source.abs, dest.abs);

    return {
        oldPath: toApiPath(source.rel),
        newPath: toApiPath(destRel),
    };
}

export async function deletePacNode(root: string, apiPath: string): Promise<void> {
    const target = await resolvePacPath(root, apiPath, { mustExist: true });

    if (!target.rel) {
        throwUnprcessable("不能删除 PAC 根目录");
    }

    const stat = await fs.lstat(target.abs);

    await fs.rm(target.abs, {
        recursive: stat.isDirectory(),
        force: false,
    });
}