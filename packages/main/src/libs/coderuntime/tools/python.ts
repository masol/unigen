// packages/main/src/libs/coderuntime/tools/python.ts
//
// Python 运行工具（全流程基于 uv）。
//
// Agent 标准流程：把代码写到项目内的相对路径（推荐二级功能目录，如
// `mytask/main.py`），或直接传 `code` → 调用 run_python → 根据
// stdout / stderr / exit_code 决定修复、重试或继续。
//
// cwd 语义：
//   - **默认恒定为项目根目录**；agent 不传 cwd，所有相对路径（script_path、
//     脚本内的相对引用等）均基于项目根解析。
//   - **例外**：当项目未打开且调用方只传 `code`、无 `script_path`、无
//     `dependencies` 时（典型场景是 `testRuntime` 验证运行时本身），
//     cwd 降级为 `<os.tmpdir()>/unigen`；.venv 也会在该降级目录下创建。
//     任何触及项目文件 / 依赖安装的调用会以不可处理异常拒绝。
//   - `.venv` 位于 cwd；若已存在则复用（跨调用复用依赖，不用重复安装）。
//
// 依赖语义：
//   - `dependencies` 是**唯一入口**；运行时 `uv pip install <deps...>` 到
//     当前的 `.venv`。venv 就是依赖的持久化记录（`uv pip freeze` 可查）。
//   - 无需 agent 额外 write_file 写 requirements.txt —— 一步完成依赖 +
//     执行。若 agent 想维护 requirements.txt 声明，可以自行 write_file
//     写；runtime 不改写用户既有文件。
//
// timeout 语义：
//   - 默认 5 分钟；**无上限**；强烈建议 agent 显式传入，防死循环。
//
// 关键设计：
//   - `buildUvEnv()` 统一构造 env，包含本地隔离三要素（UV_INSTALL_DIR /
//     UV_PYTHON_INSTALL_DIR / UV_CACHE_DIR）与镜像（中国区附加
//     UV_PYTHON_INSTALL_MIRROR / UV_DEFAULT_INDEX / UV_INDEX_URL）；
//   - 所有命令通过 execa `env` 逐次注入，不修改 process.env；
//   - 环境、安装、执行都通过 uv，**不直接调用 python.exe**；
//   - venv 目录使用标准的 `.venv`，与 `uv run` 默认行为一致；
//   - `--active` + `VIRTUAL_ENV` 明确告知 uv 使用哪个 venv；
//   - `--no-project` 避免把 cwd 下的 `pyproject.toml` 当项目（隔离 venv，
//     不读用户项目配置）。

import { stableConfig } from "$libs/store/stable.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
    buildUvEnv,
    DEFAULT_PYTHON_VERSION,
} from "../engines/python.js";
import { codeRuntimeManager } from "../manager.js";
import {
    formatCommand,
    limitOutput,
    prepareRunContext,
    requiresProjectContext,
    resolveRequiredProjectPath,
} from "./shared.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const VENV_DIRNAME = ".venv";

const inputSchema = z
    .object({
        script_path: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
                "要运行的 Python 脚本文件路径，**推荐使用相对项目根目录的路径**" +
                "（例如 'mytask/main.py'，建议放入以功能命名的二级子目录）。" +
                "与 code 二选一。",
            ),
        code: z
            .string()
            .min(1)
            .optional()
            .describe(
                "内联 Python 代码；与 script_path 二选一。" +
                "会写入 cwd 的临时文件（隐藏前缀 .unigen_run_*.py）执行；" +
                "代码中的相对路径一律相对 cwd 解析，执行结束后临时文件自动删除。",
            ),
        args: z
            .array(z.string())
            .default([])
            .describe("传给脚本的命令行参数数组。"),
        dependencies: z
            .array(z.string())
            .default([])
            .describe(
                "运行前通过 uv pip 安装的依赖列表（包名 + 可选版本约束，" +
                "例如 'requests' 或 'numpy>=1.26'）。" +
                "安装到 cwd 的 .venv，**venv 是依赖的持久化记录**" +
                "（`uv pip freeze` 可查），下次调用会复用已有 venv。" +
                "这是触发依赖安装的唯一入口；传空数组表示跳过安装。" +
                "**无项目时不允许非空**（.venv 需要有项目根可写）。",
            ),
        timeout_ms: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
                `执行超时（毫秒），默认 ${DEFAULT_TIMEOUT_MS}（5 分钟），无上限。` +
                "**强烈建议显式传入**：根据任务规模预估时长并留 20–30% 富余，" +
                "可有效防止死循环 / 阻塞 I/O 长时间挂住运行时。",
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
    success: z
        .boolean()
        .describe(
            "工具基础设施是否成功：venv 创建、依赖安装、进程启动与结束均顺利完成。" +
            "注意与 exit_code 语义不同：脚本自身以非零退出码结束仍视为 success=true，" +
            "exit_code 才是脚本本身的语义结果。",
        ),
    exit_code: z
        .number()
        .int()
        .describe("脚本进程的退出码；-1 表示未正常启动。"),
    stdout: z.string(),
    stderr: z.string(),
    duration_ms: z.number().nonnegative(),
    command: z
        .string()
        .describe("实际执行的命令（仅展示 / 复现用，未做 shell 转义）。"),
    timed_out: z.boolean().describe("是否因超时被终止。"),
    venv_dir: z
        .string()
        .optional()
        .describe(
            "本次使用的 venv 目录；基础设施失败且尚未创建 venv 时可能为空。",
        ),
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

/**
 * 安装依赖到当前 venv。
 *
 * - `dependencies` 为空：直接返回（依赖视为已就绪）。
 * - 否则：`uv pip install --python <venvPython> <deps...>` 安装。
 *
 * **不**改写 cwd 的 requirements.txt：避免覆盖用户项目既有声明文件。
 * venv 本身即依赖的持久化记录，跨调用复用；用户如需声明文件可自行写入。
 */
async function installDependencies(
    uvExe: string,
    venvPython: string,
    dependencies: string[],
    registryOverride: string | undefined,
    timeoutMs: number,
): Promise<void> {
    if (dependencies.length === 0) return;

    const env = buildUvEnv();
    if (registryOverride) {
        env.UV_DEFAULT_INDEX = registryOverride;
        env.UV_INDEX_URL = registryOverride;
    }

    await execa(
        uvExe,
        ["pip", "install", "--python", venvPython, ...dependencies],
        {
            reject: true,
            env,
            timeout: timeoutMs,
            windowsHide: true,
        },
    );
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
        VIRTUAL_ENV: venvDir,
    };

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
        "在隔离的 Python 运行时（uv + .venv）中执行代码。**这是 Agent 核心执行步骤**：" +
        "先把代码写入项目文件（或直接传 code），再调用本工具运行，" +
        "根据 stdout / stderr / exit_code 决定修复、重试或继续。" +
        "\n\n【何时使用】" +
        "\n- 验证刚编写或修改的 Python 代码；" +
        "\n- 需要安装第三方依赖并立即执行（一步完成：dependencies + script_path/code）；" +
        "\n- 运行项目中已有的 .py 文件。" +
        "\n\n【路径约定】" +
        "\n- **推荐使用相对路径**：script_path 相对项目根解析；" +
        "建议放入以功能命名的二级子目录（如 'mytask/main.py'），避免污染项目根。" +
        "\n- **不要传绝对路径**（除非有明确外部原因）；runtime 已在项目根执行，相对路径足够。" +
        "\n- **cwd 恒为项目根**（在 Agent 上下文中），agent 无需也无法传入 cwd。" +
        "\n- `.venv` 位于项目根；若已存在会复用（跨调用复用依赖）。" +
        "\n\n【依赖一步完成】" +
        "\n- 通过 dependencies 传入包名列表：运行时自动 `uv pip install` 到 .venv，" +
        "然后立即执行脚本 —— 无需先 write_file 写 requirements.txt。" +
        "\n- venv 是依赖的持久化记录（`uv pip freeze` 可查）；下次调用会复用。" +
        "\n- 若你想维护 requirements.txt 用于声明 / 分享，可以自行 write_file 写；" +
        "runtime 不会改写你已存在的声明文件。" +
        "\n\n【超时建议】" +
        "\n- 默认 5 分钟；**强烈建议**按任务规模显式传 timeout_ms（留 20–30% 富余），以防止死循环。" +
        "\n\n【返回结构】" +
        "\nsuccess / exit_code / stdout / stderr / timed_out / duration_ms / command / venv_dir。" +
        "**success 与 exit_code 语义不同**：success 表示工具基础设施（venv 创建、依赖安装、进程启动等）" +
        "顺利完成，脚本自身以非零退出码结束仍视为 success=true；exit_code 才是脚本的语义结果。" +
        "exit_code 非零时先读 stderr，再针对性修改代码或 dependencies 后重试。" +
        "\n\n【环境保证】" +
        "所有产物（uv 二进制 / Python 解释器 / 缓存 / .venv）限制在应用数据目录与项目目录内，" +
        "不污染系统环境；",
    inputSchema,
    outputSchema,
    execute: async (input) => {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg?.enabled || !cfg.engines?.python?.enabled) {
            throw new Error(
                "Python 代码运行时未启用，请先在设置中开启后再试。",
            );
        }

        const project = await prepareRunContext("运行 Python 代码");
        if (requiresProjectContext(input) && !project.isProject) {
            throw new Error(
                "当前未打开项目，无法运行项目内脚本或安装依赖。" +
                "请先打开项目；若只想验证运行时本身，请仅传入 code 并省略 dependencies。",
            );
        }
        const cwd = project.cwd;

        const runtime = await codeRuntimeManager.assertReady("python");
        const pythonVersion =
            cfg.engines.python.version ?? DEFAULT_PYTHON_VERSION;
        const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

        // 临时内联脚本落 cwd（项目根或降级 tmp），与 script_path 模式语义统一。
        let scriptPath: string;
        let tempScript = false;
        if (input.script_path) {
            scriptPath = resolveRequiredProjectPath(
                input.script_path,
                "script_path",
            );
        } else {
            const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            scriptPath = join(cwd, `.unigen_run_${suffix}.py`);
            await fs.writeFile(scriptPath, input.code ?? "", "utf8");
            tempScript = true;
        }

        try {
            const { venvDir, venvPython } = await ensureVenv(
                runtime.executablePath,
                cwd,
                pythonVersion,
            );

            await installDependencies(
                runtime.executablePath,
                venvPython,
                input.dependencies,
                cfg.engines.python.registry,
                timeoutMs,
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
                // success = 基础设施层面成功：venv 创建 + 依赖安装 + 进程启动与结束。
                // 脚本以非零退出码结束仍是 success=true；exit_code 表达业务结果。
                success: true,
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
        const lines: string[] = [
            `success=${output.success}  exit_code=${output.exit_code}  duration_ms=${output.duration_ms}  timed_out=${output.timed_out}`,
        ];

        if (output.venv_dir) {
            lines.push(`venv: ${output.venv_dir}`);
        }
        if (!output.success) {
            // 正常情况下不会到达：基础设施失败走 throw。保留为防御。
            lines.push(
                "⚠️ 工具基础设施执行失败；请查看 stderr 与 command，必要时调整参数后重试。",
            );
        }
        if (output.timed_out) {
            lines.push(
                "⚠️ 执行超时：可增大 timeout_ms、拆分任务，或检查是否存在死循环 / 阻塞 I/O。",
            );
        }

        // 常见错误模式识别，给出轻量恢复提示（不替换原样 stderr）。
        if (/ModuleNotFoundError|ImportError/.test(output.stderr)) {
            lines.push(
                "提示：疑似缺少模块。请把包名加入 dependencies 后重试。",
            );
        }
        if (/\bEACCES\b|\bEPERM\b|Permission denied/.test(output.stderr)) {
            lines.push(
                "提示：疑似权限问题。请检查 cwd 与 venv 目录的权限。",
            );
        }
        if (/SyntaxError|IndentationError/.test(output.stderr)) {
            lines.push(
                "提示：疑似语法错误。请先修改代码后再重试。",
            );
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