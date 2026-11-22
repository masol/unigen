// packages/main/src/libs/coderuntime/tools/shared.ts
//
// 各语言运行工具共享的路径/输出辅助。

import { getRunnerContextWithNull } from "$libs/project/controllers/runner.js";
import { getCurrentProject } from "$libs/utils/api/index.js";
import { throwUnprocessable } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve as resolvePath } from "node:path";

/**
 * 解析用户提供的路径为绝对路径。
 *
 * 语义约定：
 * - 绝对路径：原样返回；
 * - 项目已打开：`prj.getPath(raw)`；
 * - 项目未打开：相对路径退化为基于主进程 cwd 的绝对路径，便于不依赖
 *   项目路径的场景（如测试、只读绝对路径）继续执行。**仅执行期可如此**；
 *   任何"安装 / 写入 / 读取 / 创建 venv"等环境准备，调用方必须改用
 *   `resolveRequiredProjectPath`，避免产物落到主进程 cwd 造成副作用。
 *
 * 该函数**永不抛错**；警告日志会明确提示退化为主进程 cwd。
 */
export function resolveRuntimePath(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (isAbsolute(trimmed)) return trimmed;

    const prj = getCurrentProject();
    if (prj) {
        const resolved = prj.getPath(trimmed);
        Logger.debug(`[CodeRuntime] resolveRuntimePath(project) → ${resolved}`);
        return resolved;
    }

    const abs = resolvePath(trimmed);
    Logger.warn(
        `[CodeRuntime] 未打开项目，相对路径 "${raw}" 已基于主进程 cwd 解析为 "${abs}"。` +
        `执行期可继续；涉及安装 / 写入 / 读取的调用方必须改用 resolveRequiredProjectPath。`,
    );
    return abs;
}

/**
 * 解析**必须依赖项目**的相对路径为绝对路径。
 *
 * 用于环境准备场景（安装依赖、写入文件、创建 venv、读取脚本）：
 * 项目未打开时抛不可处理异常，避免路径落到主进程 cwd 造成意外副作用。
 * 绝对路径不受此约束（调用方明确指示了位置）。
 */
export function resolveRequiredProjectPath(
    raw: string,
    action: string,
): string {
    const trimmed = raw.trim();
    if (!trimmed) {
        throwUnprocessable(`路径参数为空（${action}）。`);
    }
    if (isAbsolute(trimmed)) return trimmed;

    const prj = getCurrentProject();
    if (!prj) {
        throwUnprocessable(
            `无法解析相对路径 "${raw}"（${action}）：当前未打开项目。` +
            `请传入绝对路径，或先打开项目再重试。`,
        );
        // 下面的 return 仅为 TS 控制流完整性；throwUnprocessable 已抛异常。
        return "";
    }
    return prj.getPath(trimmed);
}

/**
 * 项目根目录（绝对路径）。项目未打开或路径缺失时抛不可处理异常。
 *
 * 供需要**强制项目上下文**的调用方（如显式 `script_path` / 依赖安装）使用；
 * 允许无项目执行内联 code 的调用方请改用 `prepareRunContext`。
 */
export function getRequiredProjectRoot(action: string): string {
    const prj = getCurrentProject();
    if (!prj) {
        throwUnprocessable(
            `当前未打开项目，无法${action}。请先打开或创建项目后再调用。`,
        );
    }
    const root = (prj as { path?: unknown }).path;
    if (typeof root !== "string" || !root) {
        throwUnprocessable(
            `当前项目缺少有效根目录，无法${action}。` +
            `请确认项目已正确初始化。`,
        );
    }
    return root;
}

/**
 * 一次工具执行的运行上下文。
 *
 * 通过 `prepareRunContext` 获取，目的是把"是否依赖项目"的判断统一收口：
 * - `isProject === true`  ：cwd 为项目根；可自由使用项目内路径、写 package.json、
 *                           创建 `.venv` 等；
 * - `isProject === false` ：cwd 为 `<os.tmpdir()>/unigen`。**仅**允许纯内联
 *                           code 执行（无 `script_path`、无 `dependencies`）；
 *                           任何涉及项目文件 / 依赖安装的调用方必须显式拒绝。
 */
export interface RunContext {
    /** 执行用的 cwd（项目根或 os.tmpdir 降级目录）。 */
    cwd: string;
    /** 是否拥有项目上下文。 */
    isProject: boolean;
}

/**
 * 构造运行上下文。
 *
 * 设计意图：
 *   - Agent（`run_node` / `run_python`，工具描述里已声明"项目必开"）走
 *     `isProject === true` 路径，语义与改造前完全一致；
 *   - `testRuntime` 等"只验证运行时本身能跑 code"的场景在**无项目**时
 *     也能运行（cwd 落到 `<os.tmpdir()>/unigen`），避免强迫用户先开项目。
 *
 * 无项目时仅创建（幂等）降级目录，不抛错；调用方按需检查 `isProject`。
 */
export async function prepareRunContext(action: string): Promise<RunContext> {
    const ctx = getRunnerContextWithNull();
    const projectRoot = ctx?.prj?.path;
    console.log("projectRoot=", projectRoot)
    if (typeof projectRoot === "string" && projectRoot) {
        return { cwd: projectRoot, isProject: true };
    }

    const fallback = join(tmpdir(), "unigen");
    await fs.mkdir(fallback, { recursive: true });
    Logger.warn(
        `[CodeRuntime] 未打开项目，${action} 将使用临时目录 ${fallback}。` +
        `涉及 script_path / dependencies 的调用会被拒绝。`,
    );
    return { cwd: fallback, isProject: false };
}

/**
 * 判断"仅内联 code 执行"场景是否被允许在无项目时运行。
 *
 * 允许：`code` 非空 + `script_path` 为空 + `dependencies` 为空。
 * 其余（读取项目脚本、安装依赖、用项目根写 package.json / .venv）
 * 均需项目上下文。
 */
export function requiresProjectContext(input: {
    scriptPath?: string | undefined;
    dependencies?: readonly string[] | undefined;
}): boolean {
    if (input.scriptPath && input.scriptPath.trim()) return true;
    if (input.dependencies && input.dependencies.length > 0) return true;
    return false;
}

/** 运行输出截断阈值（字符）——避免上送模型时撑爆上下文。 */
const OUTPUT_LIMIT_CHARS = 32_000;

/**
 * 截断运行输出，同时保留头尾并显式标注省略量。
 *
 * 关键考虑：stderr 的 traceback / 异常栈通常位于输出末尾；
 * 仅截到前 N 字符会丢掉排错关键信息。这里保留约 20% 头部 + 80% 尾部：
 * - 头部保留"首行错误码 / 首条结果"；
 * - 尾部保留 traceback 结尾、最后一行错误。
 *
 * 截断标记显式写明 omit 量，让模型知道信息不完整。
 */
export function limitOutput(text: string, maxChars = OUTPUT_LIMIT_CHARS): string {
    if (text.length <= maxChars) return text;

    const omitted = text.length - maxChars;
    const headChars = Math.floor(maxChars * 0.2);
    const tailChars = maxChars - headChars;

    const head = text.slice(0, headChars);
    const tail = text.slice(-tailChars);
    return `${head}\n...（已截断 ${omitted} 个字符，保留首尾）...\n${tail}`;
}

/** 命令 + 参数格式化为审计字符串（仅展示 / 日志用，不做 shell 转义）。 */
export function formatCommand(
    executable: string,
    args: readonly string[],
): string {
    return [executable, ...args]
        .map((s) => (s.includes(" ") ? JSON.stringify(s) : s))
        .join(" ");
}

/** 绝对 / 相对路径规整；空字符串返回空串。 */
export function ensureAbsolutePath(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (isAbsolute(trimmed)) return trimmed;
    return resolveRuntimePath(trimmed);
}