// packages/main/src/libs/coderuntime/engines/nodejs.ts
//
// Node.js 引擎（class 实现）：
//   - Windows 使用 zip；macOS / Linux 使用 tar.gz；
//   - 中国区使用清华 / 中科大镜像；其他区域走官方；
//   - 归档 SHA256 从 `nodejs.reg.ts` 读取，与注册表中的版本号一致。
//
// 【npm 处理策略】
// 官方 macOS/Linux tar.gz 中，`bin/npm`、`bin/npx`、`bin/corepack` 都是
// **符号链接**，指向 `lib/node_modules/<pkg>/...`。Windows 官方 zip 中
// 这三个是**真实文件**（`npm.cmd` 等），无需任何处理。
//
//   - 主路径：`getExtractAllowSymlinks()` 对 Unix 返回 true，交由
//     `$libs/loader/archive.js` 正确解开符号链接；通用解压器内部有与
//     node-tar 互补的逃逸校验，非特权的良性相对链接可以正常创建；
//   - 兜底路径：`applyPostExtract()` 在 Unix 上检查三个入口是否齐全，
//     不齐全则手动补建。兜底是对通用解压器 `allowSymlinks` 正常工作的
//     **备用保险** —— `allowSymlinks` 生效时该段是 no-op（静默跳过），
//     任一条目缺失时才 warn 并补建。双路径同时存在让"归档完整但解压
//     跳过了链接"这种边缘情况也能自愈；
//   - 二次兜底：`tools/nodejs.js` 在 `bin/npm` 缺失时会直接 execa
//     `<node> lib/node_modules/npm/bin/npm-cli.js`，与官方 sh shim 语义
//     等价，即便上述两条路径都失败，`dependencies` 安装仍然可用。
//
// 所有版本 / 地址 / 镜像 / 哈希均来自 `./nodejs.reg.ts`；
// 本文件不含任何硬编码 URL 或下载地址。

import { stableConfig } from "$libs/store/stable.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { EngineRuntimeHandler, PostExtractContext } from "../types.js";
import {
    NODE_ARCHIVE_SHA256,
    NODE_DIST_BASE,
    NODE_PLATFORM_KEYS,
    NODE_VERSION,
    nodeArchiveExt,
    nodeArchiveRootDir,
} from "./nodejs.reg.js";
import { findSystemExecutable } from "./system.js";

function platformKey(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
): string {
    return `${platform}-${arch}`;
}

/**
 * Node.js 官方 Unix tar.gz 里 `bin/` 下由符号链接提供的入口。
 *
 * - `link`：相对安装根目录的链接路径；
 * - `target`：写入 `fs.symlink` 的相对目标（相对链接所在目录），
 *   与官方归档保持完全一致；
 * - `absoluteTarget`：相对安装根目录的绝对目标路径（仅用于存在性检查）。
 *
 * 仅在 target 真实存在时才创建链接，避免把残缺归档（例如被裁剪
 * 分发）演变成"看起来可用"的错误状态。
 */
const UNIX_NPM_SYMLINKS: ReadonlyArray<{
    link: string;
    target: string;
    absoluteTarget: string;
}> = [
        {
            link: "bin/npm",
            target: "../lib/node_modules/npm/bin/npm-cli.js",
            absoluteTarget: "lib/node_modules/npm/bin/npm-cli.js",
        },
        {
            link: "bin/npx",
            target: "../lib/node_modules/npm/bin/npx-cli.js",
            absoluteTarget: "lib/node_modules/npm/bin/npx-cli.js",
        },
        {
            link: "bin/corepack",
            target: "../lib/node_modules/corepack/dist/corepack.js",
            absoluteTarget: "lib/node_modules/corepack/dist/corepack.js",
        },
    ];

async function pathExists(p: string): Promise<boolean> {
    return fs.access(p).then(() => true, () => false);
}

/**
 * 从入口可执行文件路径反推运行时根目录。
 *
 * 约定（与本引擎 `getDefaultExecutableRelativePath` 保持一致）：
 *   - Unix：`<root>/bin/node`
 *   - Windows：`<root>/node.exe`
 */
function inferRootDirFromExecutable(exePath: string): string {
    return process.platform === "win32"
        ? dirname(exePath)
        : dirname(dirname(exePath));
}

/**
 * npm 调用描述。
 *
 * - `command`：execa 要启动的可执行文件；
 * - `argsPrefix`：真实用户参数之前的一层固定前缀（例如 `node <cli.js>`
 *   的路径）。这层差异仅在"直连 npm-cli.js"路径下出现。
 *
 * 语义等价性：官方 sh shim (`bin/npm`) 的 body 等价于
 * `exec node ".../npm-cli.js" "$@"`；Windows `npm.cmd` 内部同样通过
 * `node "...\npm-cli.js"` 执行。因此直连 cli.js **完全等价**，不改变
 * 任何参数 / env / cwd 语义。
 */
export interface NpmCommand {
    command: string;
    argsPrefix: string[];
}

/**
 * 解析 npm 入口。
 *
 * 优先级（Unix）：
 *   1. `<root>/bin/npm`（托管安装）；
 *   2. `<root>/npm`（系统安装时 rootDir 可能已经是 bin 目录）；
 *   3. `<root>/lib/node_modules/npm/bin/npm-cli.js`（通过 node 直连兜底）；
 *   4. `<root>/../lib/node_modules/npm/bin/npm-cli.js`（系统 Node 的
 *      rootDir 为 `<prefix>/bin` 时的兜底）。
 * 优先级（Windows）：`npm.cmd` 真实文件，直接使用。
 *
 * 返回 null 表示运行时目录缺少 npm；调用方应显式报错。
 */
export async function resolveNpmCommand(
    rootDir: string,
    nodeExe: string,
): Promise<NpmCommand | null> {
    if (process.platform === "win32") {
        const npmCmd = join(rootDir, "npm.cmd");
        return (await pathExists(npmCmd))
            ? { command: npmCmd, argsPrefix: [] }
            : null;
    }

    const npmCandidates = [
        join(rootDir, "bin", "npm"),
        join(rootDir, "npm"),
    ];
    for (const candidate of npmCandidates) {
        if (await pathExists(candidate)) {
            return { command: candidate, argsPrefix: [] };
        }
    }

    const cliCandidates = [
        join(rootDir, "lib", "node_modules", "npm", "bin", "npm-cli.js"),
        join(rootDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    ];
    for (const cli of cliCandidates) {
        if (await pathExists(cli)) {
            return { command: nodeExe, argsPrefix: [cli] };
        }
    }

    return null;
}

export class NodeRuntime implements EngineRuntimeHandler {
    readonly id = "nodejs" as const;

    hasDefaultArchive(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): boolean {
        return NODE_PLATFORM_KEYS[platformKey(platform, arch)] !== undefined;
    }

    /**
     * 复用系统已安装的 Node.js。
     *
     * 托管安装优先；安装 / 下载最终失败后，manager 会回退到这里探测
     * PATH 中的 node / node.exe，验证通过后直接使用系统二进制。
     */
    async detectSystemExecutable(): Promise<string | null> {
        return findSystemExecutable({
            binaryNames: process.platform === "win32" ? ["node.exe"] : ["node"],
            logLabel: "Node.js",
        });
    }

    getMissingRuntimeMessage(): string {
        if (process.platform === "win32") {
            return (
                `未检测到可用的系统 Node.js。请安装 Node.js 并将其所在目录加入 PATH 后重新启用，` +
                `或在 codeRuntime.engines.nodejs.archiveUrl 配置自定义下载源。`
            );
        }
        return (
            `未检测到系统安装的 Node.js。请通过系统包管理器、nvm 或官方安装包安装 Node.js，` +
            `并确保 node 在 PATH 中；也可以在 codeRuntime.engines.nodejs.archiveUrl 配置自定义下载源。`
        );
    }

    getDefaultArchiveUrls(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string[] | undefined {
        const key = NODE_PLATFORM_KEYS[platformKey(platform, arch)];
        if (!key) return undefined;

        const ext = nodeArchiveExt(platform);
        const filename = `node-v${NODE_VERSION}-${key}.${ext}`;
        const prefix = `/v${NODE_VERSION}/${filename}`;

        const inChina = stableConfig().get("isChina");
        const bases = inChina && NODE_DIST_BASE.china.length > 0
            ? NODE_DIST_BASE.china
            : [NODE_DIST_BASE.official];

        return bases
            .map((b) => `${b.trim()}`)
            .filter(Boolean)
            .map((b) => `${b}${prefix}`);
    }

    getDefaultExecutableRelativePath(
        platform: NodeJS.Platform,
    ): string | undefined {
        return platform === "win32" ? "node.exe" : "bin/node";
    }

    getDefaultExtractStripPrefix(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined {
        const key = NODE_PLATFORM_KEYS[platformKey(platform, arch)];
        if (!key) return undefined;
        return `${nodeArchiveRootDir(key)}/`;
    }

    /**
     * Unix 放行符号链接（`bin/npm` / `bin/npx` / `bin/corepack`）；
     * Windows 拒绝（zip 中它们本就是真实文件，无需符号链接）。
     *
     * 逃逸校验由 `$libs/loader/archive.js` 在解压阶段完成（与 node-tar
     * 内置防护互补）；本引擎只负责"告知归档语义"。
     */
    getExtractAllowSymlinks(
        platform: NodeJS.Platform,
        _arch: NodeJS.Architecture,
    ): boolean {
        return platform !== "win32";
    }

    /**
     * 归档 SHA256（对应固定版本）。
     *
     * 由于镜像与官方内容一致，此哈希可同时用于官方 / 中国区下载。
     * 只有在用户未指定 `archiveUrl`（走内置源）时，manager 才会采用此值。
     */
    getExpectedSha256(
        platform: NodeJS.Platform,
        arch: NodeJS.Architecture,
    ): string | undefined {
        return NODE_ARCHIVE_SHA256[platformKey(platform, arch)];
    }

    /**
     * 兜底：若解压阶段未恢复 Unix 侧三个 bin 入口，则手动补建。
     *
     * 正常路径（`getExtractAllowSymlinks() === true` 且 node-tar 版本支持）
     * 下本函数是**静默 no-op**：三个链接已被创建，`pathExists` 命中即
     * `continue`，不打印任何日志。
     *
     * 尽管 `allowSymlinks` 已让通用解压器支持符号链接，保留本兜底有两个
     * 原因：
     *   1. 兼容历史归档 / 未来 tar 版本行为变化导致链接被跳过；
     *   2. 让 `run_node` 的依赖安装路径**永远**有一条能从根目录重新构建
     *      可用 npm 的手段（如果解压器某天行为改变，不必第二处修改）。
     *
     * 失败仅 warn 不抛错：工具层的第三层兜底（直连 npm-cli.js）可以直接
     * 覆盖这一场景。
     */
    async applyPostExtract(ctx: PostExtractContext): Promise<void> {
        if (process.platform === "win32") return;

        for (const entry of UNIX_NPM_SYMLINKS) {
            if (ctx.signal?.aborted) return;

            const linkPath = join(ctx.rootDir, entry.link);
            const targetPath = join(ctx.rootDir, entry.absoluteTarget);

            try {
                if (!(await pathExists(targetPath))) {
                    Logger.warn(
                        `[CodeRuntime] Node 归档缺少符号链接目标：${targetPath}；跳过 ${entry.link}。`,
                    );
                    continue;
                }

                if (await pathExists(linkPath)) {
                    // node-tar 已正确恢复链接；主路径，无需日志噪音。
                    continue;
                }

                await fs.mkdir(dirname(linkPath), { recursive: true });
                await fs.symlink(entry.target, linkPath);
                Logger.warn(
                    `[CodeRuntime] 兜底：解压阶段未恢复符号链接，已手动创建 ${entry.link} -> ${entry.target}`,
                );
            } catch (error) {
                Logger.warn(
                    `[CodeRuntime] 恢复符号链接失败 ${entry.link}：${error instanceof Error ? error.message : String(error)}；` +
                    `工具层将回退到直接执行 npm-cli.js。`,
                );
            }
        }
    }

    /**
     * 验证 node 可执行文件，并**软校验** npm 可用性。
     *
     * 校验策略：
     *   - **node**：必须成功（`--version`），失败则 throw → manager 标记
     *     `failed`；
     *   - **npm**：仅在 node 成功后附加校验；npm 缺失 / `--version` 失败
     *     **只 warn**，不 throw。
     *
     * 为什么 npm 软失败？
     *   - npm 是 Node 运行时的附属组件，缺失极少发生（正常归档都带）；
     *   - 若因不明原因缺失（裁剪分发 / 未来布局调整），硬失败会让整个
     *     运行时被标记 `failed`、阻断所有后续调用，也无法通过调整用户
     *     配置修复；
     *   - 实际的依赖安装场景由 `run_node` 的 `installDependencies` 显式
     *     抛错，用户获得的错误上下文更精确；
     *   - 主动 probe 的价值是把"装完没 npm"提前暴露在安装日志里，便于
     *     用户排查，而不牺牲运行时可用性。
     */
    async verifyExecutable(
        executablePath: string,
        ctx: { timeoutMs?: number; signal?: AbortSignal },
    ): Promise<string> {
        const timeoutMs = ctx.timeoutMs ?? 15_000;

        // ── 硬校验：node 本体 ──
        const result = await execa(executablePath, ["--version"], {
            reject: false,
            windowsHide: true,
            timeout: timeoutMs,
            cancelSignal: ctx.signal,
        });
        if (result.exitCode !== 0) {
            throw new Error(
                `node --version 失败：${result.stderr || result.stdout || "未知错误"}`,
            );
        }
        const nodeVersion = (result.stdout || result.stderr).trim();

        // ── 软校验：npm 入口 ──
        const rootDir = inferRootDirFromExecutable(executablePath);
        const npm = await resolveNpmCommand(rootDir, executablePath);
        if (!npm) {
            Logger.warn(
                `[CodeRuntime] Node 运行时目录（${rootDir}）缺少 npm 入口；` +
                `run_node 的 dependencies 安装将不可用。` +
                `可能原因：归档被裁剪，或符号链接未被恢复。`,
            );
            return nodeVersion;
        }

        try {
            const npmResult = await execa(
                npm.command,
                [...npm.argsPrefix, "--version"],
                {
                    reject: false,
                    windowsHide: true,
                    timeout: timeoutMs,
                    cancelSignal: ctx.signal,
                },
            );
            if (npmResult.exitCode !== 0) {
                Logger.warn(
                    `[CodeRuntime] npm --version 失败：${npmResult.stderr || npmResult.stdout || "未知错误"}；` +
                    `run_node 的 dependencies 安装将可能失败。`,
                );
            } else {
                const npmVersion = (npmResult.stdout || npmResult.stderr).trim();
                Logger.log(`[CodeRuntime] npm 就绪：${npmVersion}`);
            }
        } catch (error) {
            Logger.warn(
                `[CodeRuntime] 校验 npm 时异常：${error instanceof Error ? error.message : String(error)}`,
            );
        }

        return nodeVersion;
    }
}

export { NODE_VERSION };
