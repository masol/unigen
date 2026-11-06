import type { IProjectContext } from "$libs/project/type.js";
import { throwPrecondition } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import type { CompileCache } from "../type.js";

function sanitizeToolKey(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "_tool";
}

export function uniqueKey(candidate: string, taken: Set<string>): string {
    const base = sanitizeToolKey(candidate);
    if (!taken.has(base)) return base;
    let n = 2;
    const suffix = () => `${base}_${n}`;
    while (taken.has(suffix())) n++;
    const next = suffix();
    Logger.warn(`[PAC] 工具名冲突,重命名为 ${next}`);
    return next;
}

function splitRelPath(p: string): string[] {
    return p.replace(/[\\/]+/g, "/").split("/").filter((s) => s.length > 0);
}

function normalizeSegments(base: string[], rel: string[], original: string): string[] {
    const out = [...base];
    for (const seg of rel) {
        if (!seg || seg === ".") continue;
        if (seg === "..") {
            if (out.length === 0) {
                throwPrecondition(`[PAC] 路径越界,不允许逃出 pac 根目录: ${original}`);
            }
            out.pop();
            continue;
        }
        out.push(seg);
    }
    return out;
}

function ensureInsideRoot(rootBase: string[], full: string[], original: string): void {
    if (full.length < rootBase.length) {
        throwPrecondition(`[PAC] 路径越界,不允许逃出 pac 根目录: ${original}`);
    }
    for (let i = 0; i < rootBase.length; i++) {
        if (full[i] !== rootBase[i]) {
            throwPrecondition(`[PAC] 路径越界,不允许逃出 pac 根目录: ${original}`);
        }
    }
}

export function getAbsPath(prj: IProjectContext, segments: string[]): string {
    const abs = prj.getPath(segments);
    if (!abs) {
        throwPrecondition(`[PAC] 无法解析路径: ${segments.join("/")}`);
    }
    return abs;
}

export function sameSegments(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function resolveSegments(
    rootBase: string[],
    currentBase: string[],
    p: string,
    ext: string | null,
): string[] {
    const normalized = p.replace(/[\\/]+/g, "/");
    const rootAnchored = normalized.startsWith("/");
    const relRaw = rootAnchored ? normalized.slice(1) : normalized;
    const rel = splitRelPath(relRaw);

    if (ext) {
        if (rel.length === 0) {
            throwPrecondition(`[PAC] 文件路径为空: ${p}`);
        }
        const last = rel[rel.length - 1];
        if (!last.endsWith(ext)) {
            rel[rel.length - 1] = `${last}${ext}`;
        }
    }

    const base = rootAnchored ? rootBase : currentBase;
    const full = normalizeSegments(base, rel, p);
    ensureInsideRoot(rootBase, full, p);
    return full;
}

/**
 * 解析相对路径文件。只通过 prj.getPath 获取绝对路径，不检查存在。
 */
export function resolveProjectPath(
    prj: IProjectContext,
    rootBase: string[],
    currentBase: string[],
    p: string,
    ext: string | null = ".md",
): { abs: string; segments: string[]; base: string[] } {
    const segments = resolveSegments(rootBase, currentBase, p, ext);
    return {
        abs: getAbsPath(prj, segments),
        segments,
        base: segments.slice(0, -1),
    };
}

export function resolveProjectDir(
    prj: IProjectContext,
    rootBase: string[],
    currentBase: string[],
    p: string,
): { abs: string; segments: string[] } {
    const segments = resolveSegments(rootBase, currentBase, p, null);
    return {
        abs: getAbsPath(prj, segments),
        segments,
    };
}

export function createCompileCache(
    rootBase: string[],
    rootEntry?: string[],
): CompileCache {
    return { compiled: new Map(), compiling: new Set(), rootBase, rootEntry };
}

/** 由 rootBase + 文件分段路径生成稳定 agent id(用作 HistoryStore 的子键) */
export function buildAgentId(rootBase: string[], sourceSegments: string[]): string {
    const rel = sourceSegments.slice(rootBase.length).join("/");
    return rel.endsWith(".md") ? rel.slice(0, -3) : rel;
}