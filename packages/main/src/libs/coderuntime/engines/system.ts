// packages/main/src/libs/coderuntime/engines/system.ts
//
// 系统已安装运行时的通用探测实现。
//
// aria2 / Node.js / Python(uv) 共享同一套 PATH + 常见目录探测逻辑，
// 避免每个引擎各写一份导致行为漂移。

import Logger from "electron-log/main.js";
import { constants, promises as fs } from "node:fs";
import { isAbsolute, join, resolve as resolvePath } from "node:path";

/**
 * GUI 进程在 macOS / Linux 上经常拿不到完整 PATH；这里补充常见安装目录。
 *
 * 仅做只读探测，命中后仍由引擎 `verifyExecutable()` 验证，
 * 不会因为目录里存在同名文件就误判为可用。
 */
const EXTRA_SEARCH_DIRS: Partial<Record<NodeJS.Platform, readonly string[]>> = {
    darwin: [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
    ],
    linux: [
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/snap/bin",
    ],
};

export interface FindSystemExecutableOptions {
    /** 可执行文件名，按顺序尝试；Windows 需要包含 `.exe`。 */
    binaryNames: readonly string[];
    /** 额外搜索目录；非绝对路径会被忽略。 */
    extraSearchDirs?: readonly string[];
    /** 日志中的运行时名称，例如 `aria2c` / `Node.js` / `uv`。 */
    logLabel: string;
}

function buildSearchDirs(extraSearchDirs: readonly string[]): string[] {
    const separator = process.platform === "win32" ? ";" : ":";
    const fromEnv = (process.env.PATH ?? "")
        .split(separator)
        .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
        .filter((entry) => isAbsolute(entry));

    const common = EXTRA_SEARCH_DIRS[process.platform] ?? [];
    const seen = new Set<string>();
    const dirs: string[] = [];

    for (const dir of [...fromEnv, ...common, ...extraSearchDirs]) {
        if (!isAbsolute(dir)) continue;
        const normalized = resolvePath(dir);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        dirs.push(normalized);
    }
    return dirs;
}

async function isExecutableFile(target: string): Promise<boolean> {
    try {
        const info = await fs.stat(target);
        if (!info.isFile()) return false;
        await fs.access(target, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * 在 PATH 与常见安装目录中查找第一个可执行的系统二进制。
 *
 * - 返回绝对路径；
 * - 只做存在性 / 可执行性检查，不执行 `--version`；
 * - 验证由调用方（CodeRuntimeManager）统一完成，避免重复 spawn。
 */
export async function findSystemExecutable(
    options: FindSystemExecutableOptions,
): Promise<string | null> {
    const dirs = buildSearchDirs(options.extraSearchDirs ?? []);
    const names = options.binaryNames
        .map((name) => name.trim())
        .filter(Boolean);

    for (const dir of dirs) {
        for (const name of names) {
            const candidate = join(dir, name);
            if (!(await isExecutableFile(candidate))) continue;
            Logger.log(
                `[CodeRuntime] 检测到系统安装的 ${options.logLabel}：${candidate}`,
            );
            return candidate;
        }
    }

    Logger.log(
        `[CodeRuntime] 未检测到系统安装的 ${options.logLabel}` +
        `（已检查 ${dirs.length} 个目录）。`,
    );
    return null;
}