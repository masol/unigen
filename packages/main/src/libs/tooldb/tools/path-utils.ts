// packages/main/src/libs/tooldb/tools/path-utils.ts
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { app } from "electron";
import {
    isAbsolute,
    normalize,
    relative,
    resolve,
    sep,
} from "node:path";

/**
 * 当前工作目录（cwd）：
 * - 有 runner 上下文时 = 项目根目录；
 * - 没有 runner 上下文时退回 系统临时目录。
 */
function getCurrentCwd(): string {
    try {
        const ctx = getRunnerContext();
        const root = ctx.prj?.path;
        if (root) return resolve(root);
    } catch {
        // 忽略，退回 process.cwd()
    }
    return resolve(app.getPath('temp'));
}

/**
 * 读路径：
 * - 相对路径基于 cwd 解析；
 * - 绝对路径原样使用（允许读取 cwd 外内容）。
 */
export function resolveReadPath(rawPath: string): string {
    const raw = rawPath.trim();
    if (!raw) {
        throw new Error("path 不能为空。");
    }

    if (isAbsolute(raw)) {
        return normalize(raw);
    }
    return resolve(getCurrentCwd(), raw);
}

/**
 * exec 的 cwd：
 * - 默认 cwd；
 * - 相对路径相对 cwd 解析；
 * - 绝对路径按调用方明确意图使用。
 */
export function resolveCwd(rawPath?: string): string {
    const cwd = getCurrentCwd();
    const raw = rawPath?.trim();
    if (!raw) return cwd;

    if (isAbsolute(raw)) {
        return normalize(raw);
    }
    return resolve(cwd, raw);
}

function isInside(root: string, target: string): boolean {
    const rel = relative(root, target);
    return (
        rel === "" ||
        (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
    );
}

export interface ResolveProjectWriteOptions {
    /**
     * 是否允许目标就是 cwd 根。
     * - write_file / remove 默认 false；
     * - copy 的 destination 可为 cwd 根，因此可传 true。
     */
    allowRoot?: boolean;
}

/**
 * 写路径：严格限制在 cwd 内。
 *
 * - 相对路径：相对 cwd 解析；`..` 逃逸 cwd 会被拒绝。
 * - 绝对路径：必须位于 cwd 内；位于 cwd 外直接拒绝，不再静默改写。
 */
export function resolveProjectWritePath(
    rawPath: string,
    options: ResolveProjectWriteOptions = {},
): string {
    const raw = rawPath.trim();
    if (!raw) {
        throw new Error("path 不能为空。");
    }

    const root = getCurrentCwd();
    const target = isAbsolute(raw) ? normalize(raw) : resolve(root, raw);

    if (!isInside(root, target)) {
        throw new Error(
            `路径超出当前工作目录（cwd），已拒绝: ${rawPath}。写操作只能发生在 cwd 内。`,
        );
    }

    if (!options.allowRoot && target === root) {
        throw new Error("路径不能是 cwd 根目录本身。");
    }

    return target;
}

/** 返回相对 cwd 的路径；不在 cwd 内时返回 null。 */
export function toProjectRelative(absPath: string): string | null {
    const root = getCurrentCwd();
    if (!isInside(root, absPath)) return null;

    const rel = relative(root, absPath);
    return rel === "" ? "." : rel;
}

/**
 * 给 Agent 展示/回传时优先使用相对 cwd 路径；
 * cwd 外路径才退回绝对路径。
 */
export function toPreferredPath(absPath: string): string {
    return toProjectRelative(absPath) ?? absPath;
}