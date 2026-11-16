// paths.ts
import { throwUnprcessable } from "$libs/utils/err.js";
import path from "node:path";
import {
    MAX_NAME_LENGTH,
    MD_EXT,
    WINDOWS_ILLEGAL_RE,
    WINDOWS_RESERVED_RE,
} from "./constants.js";

export function resolveRootAbs(root: string): string {
    if (!path.isAbsolute(root)) {
        throwUnprcessable("PAC 根目录必须是绝对路径");
    }
    return path.resolve(root);
}

export function toApiPath(rel: string): string {
    return rel ? `/${rel}` : "/";
}

export function dirnameRel(rel: string): string {
    const dir = path.posix.dirname(rel);
    return dir === "." ? "" : dir;
}

export function joinRel(parent: string, name: string): string {
    return parent ? `${parent}/${name}` : name;
}

export function normalizeGlobPath(value: string): string {
    return value.replace(/\\/g, "/").replace(/\/+$/g, "");
}

export function isInside(parent: string, child: string): boolean {
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

export function normalizeRelPath(input: string, allowRoot: boolean): string {
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

export function normalizeNewName(name: string): string {
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

export function assertMarkdownFileName(name: string): void {
    if (!name.endsWith(MD_EXT)) {
        throwUnprcessable("PAC 文件必须使用 .md 后缀");
    }
}