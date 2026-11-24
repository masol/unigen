// packages/main/src/libs/coderuntime/tools/nodejs.ts
//
// Node.js 运行工具。
//
// Agent 标准流程：把代码写到项目内的相对路径（推荐二级功能目录，如
// `mytask/main.js`），或直接传 `code` → 调用 run_node → 根据
// stdout / stderr / exit_code 决定修复、重试或继续。
//
// cwd 语义：
//   - **默认恒定为项目根目录**；agent 不传 cwd，所有相对路径（script_path、
//     脚本内的相对引用等）均基于项目根解析。
//   - **例外**：当项目未打开且调用方只传 code、无 script_path、无
//     dependencies 时（典型场景是 `testRuntime` 验证运行时本身），直接以
//     `node -e <code>` 执行：不写临时文件、不访问 `os.tmpdir`。任何触及
//     项目文件 / 依赖的调用会以不可处理异常拒绝。
//   - `.npm cache / prefix` 限制在 runtime 目录，`node_modules` 与
//     package.json 位于 cwd（即项目根）。
//
// 依赖语义：
//   - `dependencies` 是**唯一入口**；请求安装时 npm 会把它们写入 cwd
//     的 package.json 的 dependencies 字段（`npm install <deps...>` 默认保存）。
//   - 无需 agent 额外 write_file 写 package.json —— 一步完成依赖安装 + 执行。
//   - agent 仍可自行写 package.json；后续调用只需把同样的依赖列表再次作为
//     `dependencies` 传入（npm 幂等，不会膨胀）。
//
// npm 入口解析：
//   - 主路径见 `NodeRuntime`（`bin/npm` 由解压阶段恢复；Windows 使用 `npm.cmd`）；
//   - **兜底**：`bin/npm` 缺失时可直接 execa `<node> npm-cli.js`，与官方
//     sh shim 语义完全等价；
//   - 两处解析统一走 `resolveNpmCommand()`（由 `engines/nodejs.js` 导出），
//     避免引擎层与工具层各写一遍导致行为漂移。
//
// 注册表选择语义：
//   - 用户显式 `registry` 优先；
//   - 非中国区：固定官方；
//   - 中国区：**首次（或缓存失效）测速一次并持久化 7 天**（stableConfig
//     的 `npmRegistryCache`）；期间直接复用，避免每次启动/每次 install
//     都重新测速。`npm install` 失败会主动失效缓存，下次自动重测。
//
// timeout 语义：
//   - 默认 5 分钟；**无上限**；强烈建议 agent 根据任务规模显式传入
//     （留 20–30% 富余），防止死循环 / 阻塞 I/O 长时间挂住运行时。

import { probeUrls, sortByLatency } from "$libs/loader/probe.js";
import { stableConfig } from "$libs/store/stable.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import { codeRuntimeDir } from "$libs/utils/sys/dir.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
    resolveNpmCommand,
    type NpmCommand,
} from "../engines/nodejs.js";
import { NPM_REGISTRY_MIRRORS } from "../engines/nodejs.reg.js";
import { codeRuntimeManager } from "../manager.js";
import type { ReadyRuntime } from "../types.js";
import {
    formatCommand,
    limitOutput,
    prepareRunContext,
    requiresProjectContext,
    resolveRequiredProjectPath,
} from "./shared.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** npm registry 测速超时（每源）。 */
const NPM_PROBE_TIMEOUT_MS = 4_000;
/** 持久化 registry 缓存的 TTL（7 天）。 */
const NPM_REGISTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * 手动失效 npm registry 缓存。
 *
 * 用于 `npm install` 失败的场景：无论根因是网络 / 镜像 / 依赖，都把
 * `checkedAt` 置 0，下次 install 时强制重测。策略偏保守 —— 多测一次
 * 的成本可控，比"对失效镜像无感知"要友好。
 */
function invalidateNpmRegistryCache(reason: string): void {
    const current = stableConfig().get("npmRegistryCache");
    if (!current || current.checkedAt === 0) return;
    try {
        stableConfig().set("npmRegistryCache", { ...current, checkedAt: 0 });
        Logger.warn(
            `[CodeRuntime:nodejs] npm registry 缓存失效（${reason}），下次 install 将重新测速。`,
        );
    } catch (err) {
        Logger.warn(
            `[CodeRuntime:nodejs] 失效 npm registry 缓存失败：${errorMessage(err)}`,
        );
    }
}

const inputSchema = z
    .object({
        script_path: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
                "要运行的 Node.js 脚本文件路径，**推荐使用相对项目根目录的路径**" +
                "（例如 'mytask/main.js'，建议放入以功能命名的二级子目录）。" +
                "与 code 二选一。",
            ),
        code: z
            .string()
            .min(1)
            .optional()
            .describe(
                "内联 Node.js 代码；与 script_path 二选一。" +
                "写入 cwd 的临时文件（隐藏前缀 .unigen_run_*.js）执行，" +
                "代码中的相对路径一律相对 cwd 解析，执行结束后临时文件自动删除。",
            ),
        args: z
            .array(z.string())
            .default([])
            .describe(
                "传给脚本的命令行参数数组。" +
                "无项目内联模式（`node -e`）下参数落到 `process.argv[1:]`，" +
                "与文件模式（`process.argv[2:]`）语义不同。",
            ),
        dependencies: z
            .array(z.string())
            .default([])
            .describe(
                "运行前通过 npm 安装并**写入 cwd 的 package.json** 的依赖列表" +
                "（包名 + 可选版本约束，例如 'lodash' 或 'axios@^1.6.0'）。" +
                "这是触发依赖安装的唯一入口；若 cwd 已有 package.json，" +
                "npm 会把这里的每个包追加进去（幂等，不膨胀）。" +
                "传空数组表示本次跳过安装（依赖视为已就绪）。" +
                "**无项目时不允许非空**（package.json 需要有项目根可写）。",
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
            "工具基础设施是否成功：依赖安装、进程启动与结束均顺利完成。" +
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
});

export type NodeRunInput = z.infer<typeof inputSchema>;
export type NodeRunOutput = z.infer<typeof outputSchema>;

async function pathExists(p: string): Promise<boolean> {
    return fs.access(p).then(() => true, () => false);
}

/**
 * 解析实际使用的 npm registry。
 *
 * - 用户显式配置优先；
 * - 非中国区：直接官方；
 * - 中国区：
 *   1. 若 `npmRegistryCache` 命中且未过期（≤ 7d）、且 `isChina` 一致 → 复用；
 *   2. 否则对国内镜像测速，取最快，并写回 stableConfig（7d TTL）；
 *   3. 测速整体失败时**退化为首个镜像但不写缓存**，下次仍会重测。
 *
 * 排除官方源参与中国区测速：官方源对中国区通常不是最优，且探测本身
 * 可能超时，拉长首次安装时长。
 */
async function resolveNpmRegistryAsync(
    explicit: string | undefined,
): Promise<string> {
    if (explicit) return explicit;

    const inChina = stableConfig().get("isChina");
    if (!inChina) {
        return NPM_REGISTRY_MIRRORS.official;
    }

    const cache = stableConfig().get("npmRegistryCache");
    if (
        cache &&
        cache.checkedAt > 0 &&
        cache.isChina === inChina &&
        Date.now() - cache.checkedAt < NPM_REGISTRY_TTL_MS
    ) {
        Logger.log(
            `[CodeRuntime:nodejs] 复用 npm registry 缓存 → ${cache.url}`,
        );
        return cache.url;
    }

    const mirrors = NPM_REGISTRY_MIRRORS.china;
    try {
        const results = await probeUrls(mirrors, {
            timeoutMs: NPM_PROBE_TIMEOUT_MS,
            method: "HEAD",
        });
        const sorted = sortByLatency(results);
        const best = sorted.find((r) => r.reachable)?.url ?? mirrors[0]!;
        try {
            stableConfig().set("npmRegistryCache", {
                url: best,
                checkedAt: Date.now(),
                isChina: inChina,
            });
        } catch (err) {
            Logger.warn(
                `[CodeRuntime:nodejs] 写入 npm registry 缓存失败：${errorMessage(err)}`,
            );
        }
        Logger.log(
            `[CodeRuntime:nodejs] npm registry 测速结果 → ${best}（共 ${mirrors.length} 个候选，缓存 7 天）`,
        );
        return best;
    } catch (err) {
        Logger.warn(
            `[CodeRuntime:nodejs] npm registry 测速失败：${errorMessage(err)}；` +
            `使用首个镜像 ${mirrors[0]}（不写缓存，下次 install 将重测）。`,
        );
        return mirrors[0]!;
    }
}

async function ensurePackageJson(cwd: string): Promise<void> {
    const pkgPath = join(cwd, "package.json");
    if (await pathExists(pkgPath)) return;
    await fs.writeFile(
        pkgPath,
        JSON.stringify(
            {
                name: "unigen-sandbox",
                version: "0.0.0",
                private: true,
            },
            null,
            2,
        ) + "\n",
        "utf8",
    );
}

/**
 * 安装（并按需写入 cwd 的 package.json）依赖列表。
 *
 * - `dependencies` 为空：直接返回（依赖视为已就绪）。
 * - 否则：`ensurePackageJson(cwd)` → `npm install --no-audit --no-fund <deps...>`。
 *   **注意**：不加 `--no-save`，让 npm 把依赖写入 cwd 的 package.json 的
 *   dependencies 字段（反映"加入 package"的语义）；npm 幂等，不膨胀。
 * - npm 入口经 `resolveNpmCommand()` 统一解析：优先 `bin/npm`（由解压阶段
 *   恢复或 `applyPostExtract` 兜底），缺失时回退到直连 `npm-cli.js`。
 * - 失败时主动失效 npm registry 缓存，以便下次 install 重新测速。
 */
async function installDependencies(
    runtime: ReadyRuntime,
    dependencies: string[],
    cwd: string,
    registryOverride: string | undefined,
    timeoutMs: number,
): Promise<void> {
    if (dependencies.length === 0) return;

    const npm: NpmCommand | null = await resolveNpmCommand(
        runtime.rootDir,
        runtime.executablePath,
    );
    if (!npm) {
        throw new Error(
            `未找到 npm 入口：node 运行时目录（${runtime.rootDir}）中未见 ` +
            `bin/npm、npm.cmd 或 lib/node_modules/npm/bin/npm-cli.js。` +
            `请确认 Node.js 归档完整，或在设置中重新安装代码运行时。`,
        );
    }

    const registry = await resolveNpmRegistryAsync(registryOverride);

    // 本地隔离：npm 的 cache 与 global prefix 全部指向应用数据目录，
    // 避免污染 `~/.npm` 与 `~/.npm-global`。
    //
    // 使用 codeRuntimeDir 而不是 runtime.rootDir：回退到系统 Node 时
    // runtime.rootDir 可能是 /usr/bin 等不可写目录。
    const localPrefix = codeRuntimeDir("nodejs", "npm-global");
    const localCache = codeRuntimeDir("nodejs", "npm-cache");
    await fs.mkdir(localPrefix, { recursive: true });
    await fs.mkdir(localCache, { recursive: true });

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        NPM_CONFIG_REGISTRY: registry,
        npm_config_registry: registry,
        NPM_CONFIG_PREFIX: localPrefix,
        npm_config_prefix: localPrefix,
        NPM_CONFIG_CACHE: localCache,
        npm_config_cache: localCache,
        NPM_CONFIG_UPDATE_NOTIFIER: "false",
        npm_config_update_notifier: "false",
    };

    await ensurePackageJson(cwd);
    try {
        await execa(
            npm.command,
            [
                ...npm.argsPrefix,
                "install",
                "--no-audit",
                "--no-fund",
                ...dependencies,
            ],
            {
                cwd,
                env,
                timeout: timeoutMs,
                reject: true,
                windowsHide: true,
            },
        );
    } catch (error) {
        invalidateNpmRegistryCache(`npm install 失败：${errorMessage(error)}`);
        throw error;
    }
}

/**
 * 无项目内联执行路径。
 *
 * 使用 `node -e <code>` 直接执行：
 *   - **不**写临时文件；**不**访问 `os.tmpdir`；
 *   - cwd 使用 `process.cwd()`（必然存在，且我们不主动读写）；
 *   - `args` 通过 `node -e` 语义透传（落到 `process.argv[1:]`，与文件模式
 *     `process.argv[2:]` 不同，已在字段描述中声明）。
 *
 * 任何需要在文件系统上落地的操作（`script_path` / `dependencies`）由
 * 调用方在进入此函数之前已拒绝。
 */
async function runInlineNode(
    nodeExe: string,
    code: string,
    args: string[],
    extraEnv: Record<string, string> | undefined,
    timeoutMs: number,
): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
    command: string;
}> {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...(extraEnv ?? {}),
    };

    const nodeArgs = ["-e", code, ...args];

    const start = Date.now();
    const result = await execa(nodeExe, nodeArgs, {
        cwd: process.cwd(),
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
        command: formatCommand(nodeExe, nodeArgs),
    };
}

export const nodeRunTool: ToolDefinition<NodeRunInput, NodeRunOutput> = {
    name: "run_node",
    description:
        "在隔离的 Node.js 运行时中执行代码。**这是 Agent 核心执行步骤**：" +
        "先把代码写入项目文件（或直接传 code），再调用本工具运行，" +
        "根据 stdout / stderr / exit_code 决定修复、重试或继续。" +
        "\n\n【何时使用】" +
        "\n- 验证刚编写或修改的 Node.js 代码；" +
        "\n- 需要安装第三方依赖并立即执行（一步完成：dependencies + script_path/code）；" +
        "\n- 运行项目中已有的 .js 文件。" +
        "\n\n【路径约定】" +
        "\n- **推荐使用相对路径**：script_path 相对项目根解析；" +
        "建议放入以功能命名的二级子目录（如 'mytask/main.js'），避免污染项目根。" +
        "\n- **不要传绝对路径**（除非有明确外部原因）；runtime 已在项目根执行，相对路径足够。" +
        "\n- **cwd 恒为项目根**（在 Agent 上下文中），agent 无需也无法传入 cwd。" +
        "\n\n【依赖一步完成】" +
        "\n- 通过 dependencies 传入包名列表：运行时自动 `npm install` 并把它们" +
        "写入项目根 package.json，然后立即执行脚本 —— 无需先 write_file 写 package.json。" +
        "\n- 若项目根已有 package.json，npm 会把依赖追加进去（幂等，不膨胀）。" +
        "\n\n【超时建议】" +
        "\n- 默认 5 分钟；**强烈建议**按任务规模显式传 timeout_ms（留 20–30% 富余）以防止代码引发的死循环。" +
        "\n\n【返回结构】" +
        "\nsuccess / exit_code / stdout / stderr / timed_out / duration_ms / command。" +
        "**success 与 exit_code 语义不同**：success 表示工具基础设施（依赖安装、进程启动等）" +
        "顺利完成，脚本自身以非零退出码结束仍为 success=true；exit_code 才是脚本的语义结果。" +
        "exit_code 非零时先读 stderr，再针对性修改代码或 dependencies 后重试。" +
        "\n\n【环境保证】" +
        "npm cache / global prefix 限制在应用数据目录，不污染系统环境；",
    inputSchema,
    outputSchema,
    execute: async (input) => {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg.engines?.nodejs?.enabled) {
            throw new Error(
                "Node.js 代码运行时未启用，请先在设置中开启后再试。",
            );
        }

        const project = prepareRunContext("运行 Node.js 代码");

        // ── 无项目：仅允许纯内联 code（无 script_path / 无 dependencies） ──
        //
        // 直接 `node -e <code>`：
        //   - 不写临时文件；不访问 os.tmpdir；
        //   - cwd 使用 process.cwd()（必然存在，且我们不主动读写）；
        //   - args 通过 `node -e` 语义透传（process.argv[1:]）。
        if (!project.isProject) {
            if (requiresProjectContext(input)) {
                throw new Error(
                    "当前未打开项目，无法运行项目内脚本或安装依赖。" +
                    "请先打开项目；若只想验证运行时本身，请仅传入 code 并省略 dependencies。",
                );
            }

            const code = input.code;
            if (!code) {
                // zod `.refine(xor)` 保证此刻 code 非空；此处为不变量兜底。
                throw new Error("内部状态异常：inline 模式缺少 code。");
            }

            const runtime = await codeRuntimeManager.assertReady("nodejs");
            const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

            const result = await runInlineNode(
                runtime.executablePath,
                code,
                input.args,
                input.env,
                timeoutMs,
            );

            return {
                success: true,
                exit_code: result.exitCode,
                stdout: limitOutput(result.stdout),
                stderr: limitOutput(result.stderr),
                duration_ms: result.durationMs,
                command: result.command,
                timed_out: result.timedOut,
            };
        }

        // ── 有项目：保留原有流程（临时文件 / 依赖） ──
        const cwd = project.cwd;
        const runtime = await codeRuntimeManager.assertReady("nodejs");
        const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

        // 临时内联脚本落 cwd（项目根），与 script_path 模式语义一致。
        // 用隐藏前缀降低 VCS 噪声；执行结束后删除。
        let scriptPath: string;
        let tempScript = false;
        if (input.script_path) {
            scriptPath = resolveRequiredProjectPath(
                input.script_path,
                "script_path",
            );
        } else {
            const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            scriptPath = join(cwd, `.unigen_run_${suffix}.js`);
            await fs.writeFile(scriptPath, input.code ?? "", "utf8");
            tempScript = true;
        }

        const startedAt = Date.now();
        try {
            await installDependencies(
                runtime,
                input.dependencies,
                cwd,
                cfg.engines.nodejs.registry,
                timeoutMs,
            );

            const env: NodeJS.ProcessEnv = {
                ...process.env,
                ...(input.env ?? {}),
            };

            const result = await execa(
                runtime.executablePath,
                [scriptPath, ...input.args],
                {
                    cwd,
                    env,
                    timeout: timeoutMs,
                    reject: false,
                    windowsHide: true,
                },
            );

            return {
                // success = 基础设施层面成功：依赖安装 + 进程启动 + 进程结束。
                // 脚本以非零退出码结束仍是 success=true；exit_code 表达业务结果。
                success: true,
                exit_code:
                    typeof result.exitCode === "number" ? result.exitCode : -1,
                stdout: limitOutput(result.stdout ?? ""),
                stderr: limitOutput(result.stderr ?? ""),
                duration_ms: Date.now() - startedAt,
                command: formatCommand(runtime.executablePath, [
                    scriptPath,
                    ...input.args,
                ]),
                timed_out: result.timedOut === true,
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
        if (/MODULE_NOT_FOUND|Cannot find module/i.test(output.stderr)) {
            lines.push(
                "提示：疑似缺少模块。请把包名加入 dependencies（或检查路径）后重试。",
            );
        }
        if (/\bEACCES\b|\bEPERM\b/.test(output.stderr)) {
            lines.push(
                "提示：疑似权限问题。请检查 cwd 与依赖安装目录的权限。",
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