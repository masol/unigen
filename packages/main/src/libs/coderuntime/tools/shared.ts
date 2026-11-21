// packages/main/src/libs/coderuntime/tools/shared.ts
//
// 各语言运行工具共享的路径/输出辅助。

import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { isAbsolute } from "node:path";

/** 解析用户提供的路径为绝对路径。相对路径基于当前任务根目录。 */
export function resolveRuntimePath(raw: string): string {
    const ctx = getRunnerContext();
    return ctx.prj.getPath(raw);
}

/** 运行输出截断阈值（字符）——避免上送模型时撑爆上下文。 */
const OUTPUT_LIMIT_CHARS = 32_000;

/** 截断运行输出，附加截断标记。 */
export function limitOutput(text: string, maxChars = OUTPUT_LIMIT_CHARS): string {
    if (text.length <= maxChars) return text;
    const omitted = text.length - maxChars;
    return `${text.slice(0, maxChars)}\n...（已截断 ${omitted} 个字符）`;
}

/** 命令 + 参数格式化为审计字符串（仅展示/日志用，不做 shell 转义）。 */
export function formatCommand(
    executable: string,
    args: readonly string[],
): string {
    return [executable, ...args]
        .map((s) => (s.includes(" ") ? JSON.stringify(s) : s))
        .join(" ");
}

/** 绝对/相对路径规整；空字符串返回空串。 */
export function ensureAbsolutePath(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (isAbsolute(trimmed)) return trimmed;
    return resolveRuntimePath(trimmed);
}