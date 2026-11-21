// packages/main/src/libs/coderuntime/tools/nodejs.ts
//
// Node.js 运行工具。
//
// 依赖安装与执行串行完成；国内 registry 从注册表自动注入。
// 目标 cwd 若无 package.json，会写入一个最小占位以确保 npm 行为正常：
//   - 避免 `npm install` 因缺 package.json 发出的 warning；
//   - 允许 package-lock.json 正常持久化；
//   - 便于 AI 二次运行时复用 node_modules / lockfile。

import { stableConfig } from "$libs/store/stable.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import { codeRuntimeManager } from "../manager.js";
import { pickMirror, RUNTIME_REGISTRY } from "../registry.js";
import {
    formatCommand,
    limitOutput,
    resolveRuntimePath,
} from "./shared.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

const inputSchema = z
    .object({
        script_path: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
                "要运行的 Node.js 脚本文件路径（相对路径基于当前任务目录解析），与 code 二选一。",
            ),
        code: z
            .string()
            .min(1)
            .optional()
            .describe("内联 Node.js 代码；与 script_path 二选一。"),
        args: z
            .array(z.string())
            .default([])
            .describe("传给脚本的命令行参数数组。"),
        dependencies: z
            .array(z.string())
            .default([])
            .describe("运行前通过 npm 安装的依赖列表。"),
        package_json: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe(
                "package.json 路径；提供时会执行完整 `npm install`，并忽略 dependencies。",
            ),
        cwd: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe("脚本运行目录；缺省为脚本所在目录。"),
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
});

export type NodeRunInput = z.infer<typeof inputSchema>;
export type NodeRunOutput = z.infer<typeof outputSchema>;

function resolveNpmPath(rootDir: string): string {
    return process.platform === "win32"
        ? join(rootDir, "npm.cmd")
        : join(rootDir, "bin", "npm");
}

function resolveNpmRegistry(explicit: string | undefined): string {
    if (explicit) return explicit;
    return pickMirror(
        RUNTIME_REGISTRY.npm.registry,
        stableConfig().get("isChina"),
    );
}

async function pathExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * 目标 cwd 没有 `package.json` 时写入最小占位。
 *
 * 不写 `"type": "module"`，保持 Node 默认 CommonJS 行为；
 * 用户脚本可用 `.mjs` / `.cjs` 显式声明模块类型。
 */
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

async function installDependencies(
    runtime: { executablePath: string; rootDir: string },
    input: NodeRunInput,
    cwd: string,
    registryOverride: string | undefined,
): Promise<void> {
    const npmPath = resolveNpmPath(runtime.rootDir);
    const registry = resolveNpmRegistry(registryOverride);
    const env: NodeJS.ProcessEnv = { ...process.env };
    env.NPM_CONFIG_REGISTRY = registry;
    // npm 生态习惯用全小写形式，双写以兼容不同命令行路径。
    env.npm_config_registry = registry;
    const timeout = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

    if (input.package_json) {
        const pkgPath = isAbsolute(input.package_json)
            ? input.package_json
            : resolveRuntimePath(input.package_json);
        await execa(
            npmPath,
            ["install", "--no-audit", "--no-fund"],
            {
                cwd: dirname(pkgPath),
                env,
                timeout,
                reject: true,
                windowsHide: true,
            },
        );
        return;
    }

    if (input.dependencies.length > 0) {
        // 保证 cwd 至少有 package.json，否则 npm 会发 warning，
        // 且 package-lock.json 会失去根锚点。
        await ensurePackageJson(cwd);
        await execa(
            npmPath,
            [
                "install",
                "--no-audit",
                "--no-fund",
                "--no-save",
                ...input.dependencies,
            ],
            {
                cwd,
                env,
                timeout,
                reject: true,
                windowsHide: true,
            },
        );
    }
}

export const nodeRunTool: ToolDefinition<NodeRunInput, NodeRunOutput> = {
    name: "run_node",
    description:
        "在隔离的 Node.js 运行时中执行代码。安装 npm 依赖与执行脚本在同一工具调用中串行完成，" +
        "避免并行工具调用导致的依赖竞态。script_path 与 code 二选一；相对路径基于当前任务目录解析。" +
        "执行目录若无 package.json 会自动创建最小占位。",
    inputSchema,
    outputSchema,
    execute: async (input) => {
        const cfg = stableConfig().get("codeRuntime");
        if (!cfg?.enabled || !cfg.engines?.nodejs?.enabled) {
            throw new Error(
                "Node.js 代码运行时未启用，请先在设置中开启后再试。",
            );
        }

        const runtime = await codeRuntimeManager.assertReady("nodejs");
        const timeoutMs = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

        let scriptPath: string;
        let tempScript = false;
        if (input.script_path) {
            scriptPath = isAbsolute(input.script_path)
                ? input.script_path
                : resolveRuntimePath(input.script_path);
        } else {
            scriptPath = join(
                tmpdir(),
                `unigen_node_${Date.now()}_${Math.random().toString(36).slice(2)}.js`,
            );
            await fs.writeFile(scriptPath, input.code ?? "", "utf8");
            tempScript = true;
        }

        const cwd = input.cwd
            ? isAbsolute(input.cwd)
                ? input.cwd
                : resolveRuntimePath(input.cwd)
            : input.script_path
                ? dirname(scriptPath)
                : resolveRuntimePath(".");
        await fs.mkdir(cwd, { recursive: true });

        try {
            await installDependencies(
                runtime,
                input,
                cwd,
                cfg.engines.nodejs.registry,
            );

            const env: NodeJS.ProcessEnv = {
                ...process.env,
                ...(input.env ?? {}),
            };

            const start = Date.now();
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
                exit_code:
                    typeof result.exitCode === "number" ? result.exitCode : -1,
                stdout: limitOutput(result.stdout ?? ""),
                stderr: limitOutput(result.stderr ?? ""),
                duration_ms: Date.now() - start,
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
        const lines = [
            `exit_code=${output.exit_code}  duration_ms=${output.duration_ms}  timed_out=${output.timed_out}`,
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