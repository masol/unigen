// packages/main/src/libs/tooldb/tools/exec.ts
import { execa } from "execa";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../../type.js";
import { resolveCwd } from "../path-utils.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_CHARS = 200_000;

const inputSchema = z.object({
    command: z
        .string()
        .trim()
        .min(1)
        .describe(
            "要执行的程序。可以是不带路径的命令名（走 PATH），也可以是相对 项目目录 的可执行路径。" +
            "推荐把 项目目录 视为文件系统根，使用相对 项目目录 的路径，例如 `./scripts/build.js`、" +
            "`node_modules/.bin/tsc`。绝对路径仅在明确需要时使用。",
        ),
    args: z.array(z.string()).default([]).describe("传给程序的参数数组。"),
    cwd: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
            "工作目录。默认 项目目录；相对路径相对 项目目录；绝对路径仅在明确需要时使用。",
        ),
    timeout_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            `执行超时（毫秒），默认 ${DEFAULT_TIMEOUT_MS}（5 分钟），无上限。` +
            "强烈建议按任务规模显式传入，并留 20–30% 富余，防止死循环或阻塞 I/O。",
        ),
    env: z
        .record(z.string(), z.string())
        .optional()
        .describe("额外环境变量，会与主进程环境合并。"),
});

const outputSchema = z.object({
    success: z
        .boolean()
        .describe(
            "工具基础设施是否成功：进程启动与结束均顺利完成。" +
            "脚本自身以非零退出码结束仍视为 success=true；exit_code 才是业务结果。",
        ),
    exit_code: z
        .number()
        .int()
        .describe("进程退出码；-1 表示未正常启动。"),
    stdout: z.string(),
    stderr: z.string(),
    duration_ms: z.number().nonnegative(),
    command: z.string().describe("实际执行的命令（仅展示/复现用）。"),
    cwd: z.string().describe("实际工作目录。"),
    timed_out: z.boolean().describe("是否因超时被终止。"),
});

export type ExecInput = z.infer<typeof inputSchema>;
export type ExecOutput = z.infer<typeof outputSchema>;

function resolveCommand(command: string, cwd: string): string {
    const cmd = command.trim();
    if (isAbsolute(cmd)) return cmd;

    const looksLikePath =
        cmd.startsWith(".") || cmd.includes("/") || cmd.includes("\\");

    return looksLikePath ? resolve(cwd, cmd) : cmd;
}

function quoteArg(arg: string): string {
    if (arg === "") return '""';
    if (/^[A-Za-z0-9_./:=@%+-]+$/.test(arg)) return arg;
    return JSON.stringify(arg);
}

function formatCommand(command: string, args: string[]): string {
    return [command, ...args].map(quoteArg).join(" ");
}

function limitOutput(text: string): string {
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    return (
        text.slice(0, MAX_OUTPUT_CHARS) +
        `\n... [输出过长，已截断 ${text.length - MAX_OUTPUT_CHARS} 字符]`
    );
}

export const execTool: ToolDefinition<ExecInput, ExecOutput> = {
    name: "exec",
    description:
        "在 cwd 中执行程序（execa）。**cwd 默认是项目目录**：command 优先使用相对 项目目录 路径，" +
        "例如 `./scripts/build.js`、`node_modules/.bin/tsc`；不带路径的命令名会走 PATH；" +
        "绝对路径仅在明确需要时使用。cwd 默认当前 项目目录。" +
        "默认不经过 shell，不支持管道/重定向/变量展开；需要 shell 语法时显式执行 `sh -c` 或 `bash -lc`。" +
        "返回 success / exit_code / stdout / stderr / duration_ms / command / cwd / timed_out。",
    inputSchema,
    outputSchema,
    execute: async ({ command, args, cwd, timeout_ms, env }) => {
        const cwdAbs = resolveCwd(cwd);
        const commandPath = resolveCommand(command, cwdAbs);
        const timeoutMs = timeout_ms ?? DEFAULT_TIMEOUT_MS;
        const startedAt = Date.now();

        try {
            const result = await execa(commandPath, args, {
                cwd: cwdAbs,
                env: {
                    ...process.env,
                    ...(env ?? {}),
                },
                timeout: timeoutMs,
                reject: false,
                windowsHide: true,
            });

            return {
                success: true,
                exit_code:
                    typeof result.exitCode === "number"
                        ? result.exitCode
                        : -1,
                stdout: limitOutput(result.stdout ?? ""),
                stderr: limitOutput(result.stderr ?? ""),
                duration_ms: Date.now() - startedAt,
                command: formatCommand(commandPath, args),
                cwd: cwdAbs,
                timed_out: result.timedOut === true,
            };
        } catch (error) {
            const err = error as Error & {
                exitCode?: number;
                stdout?: string;
                stderr?: string;
                timedOut?: boolean;
            };

            return {
                success: false,
                exit_code:
                    typeof err.exitCode === "number" ? err.exitCode : -1,
                stdout: limitOutput(err.stdout ?? ""),
                stderr: limitOutput(err.stderr ?? err.message),
                duration_ms: Date.now() - startedAt,
                command: formatCommand(commandPath, args),
                cwd: cwdAbs,
                timed_out: err.timedOut === true,
            };
        }
    },
    toModelOutput: ({ output }) => {
        const lines: string[] = [
            `success=${output.success}  exit_code=${output.exit_code}  duration_ms=${output.duration_ms}  timed_out=${output.timed_out}`,
            `cwd: ${output.cwd}`,
        ];

        if (!output.success) {
            lines.push(
                "⚠️ 命令未能正常启动；请检查 command、cwd、权限与运行环境。",
            );
        }
        if (output.timed_out) {
            lines.push(
                "⚠️ 执行超时：可增大 timeout_ms、拆分任务，或检查是否存在死循环 / 阻塞 I/O。",
            );
        }
        if (/ENOENT|not found/i.test(output.stderr)) {
            lines.push(
                "提示：疑似命令或可执行文件不存在。请检查 command 路径；" +
                "cwd 内程序建议使用 `./xxx` 或 `node_modules/.bin/xxx`。",
            );
        }
        if (/\bEACCES\b|\bEPERM\b/.test(output.stderr)) {
            lines.push("提示：疑似权限问题。请检查 cwd 与可执行文件权限。");
        }

        lines.push(`command: ${output.command}`);
        lines.push("--- stdout ---");
        lines.push(output.stdout || "（空）");
        lines.push("--- stderr ---");
        lines.push(output.stderr || "（空）");

        return {
            type: "content",
            value: [{ type: "text", text: lines.join("\n") }],
        };
    },
};