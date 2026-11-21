// packages/main/src/libs/coderuntime/tools/python.ts
//
// Python 运行工具（全流程基于 uv）：
//   1. `uv venv --python <version> .venv`（存在则跳过）；
//   2. `uv pip install --python <venv-python> <deps>`（有依赖时）；
//   3. `uv run --active --no-project <script> <args>`（执行脚本）。
//
// 关键设计：
//   - 环境、安装、执行都通过 uv，**不直接调用 python.exe**——
//     避免绕过 uv 的环境解析逻辑；
//   - venv 目录使用标准的 `.venv`，与 `uv run` 默认行为一致，也与
//     用户生态习惯对齐；
//   - `--active` + `VIRTUAL_ENV` 明确告知 uv 使用哪个 venv；
//   - `--no-project` 避免把 cwd 下的 `pyproject.toml` 当项目（可能触发
//     非预期的 `uv sync`）。

import { secondConfig } from "$libs/store/second.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import {
    buildUvEnv,
    DEFAULT_PYTHON_VERSION,
} from "../engines/python.js";
import { codeRuntimeManager } from "../manager.js";
import {
    formatCommand,
    limitOutput,
    resolveRuntimePath,
} from "./shared.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const VENV_DIRNAME = ".venv";

const inputSchema = z
    .object({
        script_path: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
                "要运行的 Python 脚本文件路径（相对路径基于当前任务目录解析），与 code 二选一。",
            ),
        code: z
            .string()
            .min(1)
            .optional()
            .describe("内联 Python 代码；与 script_path 二选一。"),
        args: z
            .array(z.string())
            .default([])
            .describe("传给脚本的命令行参数数组。"),
        dependencies: z
            .array(z.string())
            .default([])
            .describe(
                "运行前通过 uv pip 安装的依赖列表（包名 + 可选版本约束）。" +
                "安装与执行在同一工具调用中串行完成。",
            ),
        requirements_file: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
                "requirements.txt 文件路径；若与 dependencies 同时存在，优先生效。",
            ),
        cwd: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
                "脚本运行目录；缺省为脚本所在目录（内联代码模式下为当前任务目录）。",
            ),
        timeout_ms: z
            .number()
            .int()
            .positive()
            .max(MAX_TIMEOUT_MS)
            .optional()
            .describe(
                `执行超时（毫秒），默认 ${DEFAULT_TIMEOUT_MS}，上限 ${MAX_TIMEOUT_MS}。`,
            ),
        env: z
            .record(z.string(), z.string())
            .optional()
            .describe("额外环境变量，会与主进程环境合并。"),
    })
    .refine(
        (v) => Boolean(v.script_path) !== Boolean(v.code),
        { message: "script_path 与 code 必须且只能提供一个。" },
    );

const outputSchema = z.object({
    exit_code: z.number().int(),
    stdout: z.string(),
    stderr: z.string(),
    duration_ms: z.number().nonnegative(),
    command: z.string(),
    timed_out: z.boolean(),
    venv_dir: z.string(),
});

export type PythonRunInput = z.infer<typeof inputSchema>;
export type PythonRunOutput = z.infer<typeof outputSchema>;

async function pathExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

function venvPythonPath(venvDir: string): string {
    return process.platform === "win32"
        ? join(venvDir, "Scripts", "python.exe")
        : join(venvDir, "bin", "python");
}

async function ensureVenv(
    uvExe: string,
    cwd: string,
    pythonVersion: string,
): Promise<{ venvDir: string; venvPython: string }> {
    const venvDir = join(cwd, VENV_DIRNAME);
    const venvPython = venvPythonPath(venvDir);
    if (await pathExists(venvPython)) {
        return { venvDir, venvPython };
    }

    Logger.log(`[CodeRuntime] 创建 Python venv：${venvDir}`);
    await execa(
        uvExe,
        [
            "venv",
            "--python", pythonVersion,
            "--python-preference", "managed",
            venvDir,
        ],
        {
            reject: true,
            windowsHide: true,
            env: buildUvEnv(),
            timeout: 5 * 60 * 1000,
        },
    );
    if (!(await pathExists(venvPython))) {
        throw new Error(`venv 创建后未找到 python：${venvPython}`);
    }
    return { venvDir, venvPython };
}

async function installDependencies(
    uvExe: string,
    venvPython: string,
    input: PythonRunInput,
    registryOverride: string | undefined,
): Promise<void> {
    const env = buildUvEnv();
    if (registryOverride) env.UV_DEFAULT_INDEX = registryOverride;

    const timeout = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

    if (input.requirements_file) {
        const reqPath = isAbsolute(input.requirements_file)
            ? input.requirements_file
            : resolveRuntimePath(input.requirements_file);
        await execa(
            uvExe,
            ["pip", "install", "--python", venvPython, "-r", reqPath],
            {
                reject: true,
                env,
                timeout,
                windowsHide: true,
            },
        );
        return;
    }

    if (input.dependencies.length > 0) {
        await execa(
            uvExe,
            [
                "pip",
                "install",
                "--python", venvPython,
                ...input.dependencies,
            ],
            {
                reject: true,
                env,
                timeout,
                windowsHide: true,
            },
        );
    }
}

interface RunScriptResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
    command: string;
}

async function runScriptWithUv(
    uvExe: string,
    venvDir: string,
    scriptPath: string,
    args: string[],
    cwd: string,
    extraEnv: Record<string, string> | undefined,
    timeoutMs: number,
): Promise<RunScriptResult> {
    const env: NodeJS.ProcessEnv = {
        ...buildUvEnv(),
        ...(extraEnv ?? {}),
        PYTHONIOENCODING: "utf-8",
        // `--active` 依赖 VIRTUAL_ENV，显式设置避免 uv 回落到项目环境。
        VIRTUAL_ENV: venvDir,
    };

    // 所有执行统一通过 uv run，避免绕过 uv 直接调用裸 python。
    const uvArgs = [
        "run",
        "--active",
        "--no-project",
        scriptPath,
        ...args,
    ];

    const start = Date.now();
    const result = await execa(uvExe, uvArgs, {
        cwd,
        env,
        timeout: timeoutMs,
        reject: false,
        windowsHide: true,
    });
    return {
        exitCode: typeof result.exitCode === "number" ? result.exitCode : -1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        timedOut: result.timedOut === true,
        durationMs: Date.now() - start,
        command: formatCommand(uvExe, uvArgs),
    };
}

export const pythonRunTool: ToolDefinition<PythonRunInput, PythonRunOutput> = {
    name: "run_python",
    description:
        "在隔离的 Python 运行时（uv + venv）中执行代码。创建虚拟环境、安装依赖、执行脚本" +
        "在同一工具调用中串行完成，避免并行工具调用导致的依赖竞态。" +
        "script_path 与 code 二选一；相对路径基于当前任务目录解析。" +
        "环境与执行全部通过 uv，脚本运行目录下会创建/复用 `.venv`。",
    inputSchema,
    outputSchema,
    execute: async (input) => {
        const cfg = secondConfig().get("codeRuntime");
        if (!cfg?.enabled || !cfg.engines?.python?.enabled) {
            throw new Error(
                "Python 代码运行时未启用，请先在设置中开启后再试。",
            );
        }

        const runtime = await codeRuntimeManager.assertReady("python");
        const pythonVersion =
            cfg.engines.python.version ?? DEFAULT_PYTHON_VERSION;
        const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

        // 准备脚本
        let scriptPath: string;
        let tempScript = false;
        if (input.script_path) {
            scriptPath = isAbsolute(input.script_path)
                ? input.script_path
                : resolveRuntimePath(input.script_path);
        } else {
            scriptPath = join(
                tmpdir(),
                `unigen_py_${Date.now()}_${Math.random().toString(36).slice(2)}.py`,
            );
            await fs.writeFile(scriptPath, input.code ?? "", "utf8");
            tempScript = true;
        }

        // 决定 cwd（决定 venv 位置）
        const cwd = input.cwd
            ? isAbsolute(input.cwd)
                ? input.cwd
                : resolveRuntimePath(input.cwd)
            : input.script_path
                ? dirname(scriptPath)
                : resolveRuntimePath(".");
        await fs.mkdir(cwd, { recursive: true });

        try {
            const { venvDir, venvPython } = await ensureVenv(
                runtime.executablePath,
                cwd,
                pythonVersion,
            );

            await installDependencies(
                runtime.executablePath,
                venvPython,
                input,
                cfg.engines.python.registry,
            );

            const runResult = await runScriptWithUv(
                runtime.executablePath,
                venvDir,
                scriptPath,
                input.args,
                cwd,
                input.env,
                timeoutMs,
            );

            return {
                exit_code: runResult.exitCode,
                stdout: limitOutput(runResult.stdout),
                stderr: limitOutput(runResult.stderr),
                duration_ms: runResult.durationMs,
                command: runResult.command,
                timed_out: runResult.timedOut,
                venv_dir: venvDir,
            };
        } finally {
            if (tempScript) {
                await fs.unlink(scriptPath).catch(() => undefined);
            }
        }
    },
    toModelOutput: ({ output }) => {
        const lines = [
            `exit_code=${output.exit_code}  duration_ms=${output.duration_ms}  timed_out=${output.timed_out}`,
            `venv: ${output.venv_dir}`,
            `command: ${output.command}`,
            "--- stdout ---",
            output.stdout || "（空）",
            "--- stderr ---",
            output.stderr || "（空）",
        ];
        return {
            type: "content",
            value: [{ type: "text", text: lines.join("\n") }],
        };
    },
};