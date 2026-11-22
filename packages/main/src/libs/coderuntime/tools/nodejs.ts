// packages/main/src/libs/coderuntime/tools/nodejs.ts
//
// Node.js 运行工具。
//
// 依赖安装与执行串行完成；国内 registry 从 `engines/nodejs.reg.js`
// 的中国镜像列表中**测速**选最快（进程级缓存，默认 TTL 30 分钟）；
// 国内用户测速时排除 npm 官方源（符合"国内必须启用镜像"要求）。
//
// 目标 cwd 若无 package.json，会写入一个最小占位以确保 npm 行为正常。

import { probeUrls, sortByLatency } from "$libs/loader/probe.js";
import { stableConfig } from "$libs/store/stable.js";
import type { ToolDefinition } from "$libs/tooldb/type.js";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import { NPM_REGISTRY_MIRRORS } from "../engines/nodejs.reg.js";
import { codeRuntimeManager } from "../manager.js";
import {
    formatCommand,
    limitOutput,
    resolveRuntimePath,
} from "./shared.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

/** npm registry 测速超时（每源）。 */
const NPM_PROBE_TIMEOUT_MS = 4_000;
/** 选出的 npm registry 的缓存时长。 */
const NPM_REGISTRY_TTL_MS = 30 * 60 * 1000;

let cachedNpmRegistry: { url: string; at: number } | null = null;

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

/**
 * 解析实际使用的 npm registry。
 *
 * - 用户显式配置优先；
 * - 非中国区：直接官方；
 * - 中国区：对中国镜像测速，选最快并缓存（进程级）；
 *   排除官方源参与测速。
 */
async function resolveNpmRegistryAsync(
    explicit: string | undefined,
): Promise<string> {
    if (explicit) return explicit;

    const inChina = stableConfig().get("isChina");
    if (!inChina) {
        return NPM_REGISTRY_MIRRORS.official;
    }

    if (
        cachedNpmRegistry &&
        Date.now() - cachedNpmRegistry.at < NPM_REGISTRY_TTL_MS
    ) {
        return cachedNpmRegistry.url;
    }

    const mirrors = NPM_REGISTRY_MIRRORS.china;
    try {
        const results = await probeUrls(mirrors, {
            timeoutMs: NPM_PROBE_TIMEOUT_MS,
            method: "HEAD",
        });
        const sorted = sortByLatency(results);
        const best = sorted.find((r) => r.reachable)?.url ?? mirrors[0]!;
        cachedNpmRegistry = { url: best, at: Date.now() };
        Logger.log(
            `[CodeRuntime:nodejs] npm registry 测速结果 → ${best}（共 ${mirrors.length} 个候选）`,
        );
        return best;
    } catch (err) {
        Logger.warn(
            `[CodeRuntime:nodejs] npm registry 测速失败：${err instanceof Error ? err.message : String(err)}；使用首个镜像。`,
        );
        return mirrors[0]!;
    }
}

async function pathExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
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

async function installDependencies(
    runtime: { executablePath: string; rootDir: string },
    input: NodeRunInput,
    cwd: string,
    registryOverride: string | undefined,
): Promise<void> {
    const npmPath = resolveNpmPath(runtime.rootDir);
    const registry = await resolveNpmRegistryAsync(registryOverride);

    // 本地隔离：npm 的 cache 与 global prefix 全部指向应用数据目录，
    // 避免污染 `~/.npm` 与 `~/.npm-global`。
    const localPrefix = join(runtime.rootDir, "npm-global");
    const localCache = join(runtime.rootDir, "npm-cache");
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
        "在隔离的 Node.js 运行时中执行代码（跨平台：Windows / macOS / Linux；x64 / arm64 均支持）。" +
        "安装 npm 依赖与执行脚本在同一工具调用中串行完成，避免并行工具调用导致的依赖竞态。" +
        "script_path 与 code 二选一；相对路径基于当前任务目录解析。" +
        "执行目录若无 package.json 会自动创建最小占位；npm registry 在中国区通过测速自动选择最快镜像" +
        "（官方源不参与中国区测速）；npm cache / prefix 均限制在应用数据目录。",
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