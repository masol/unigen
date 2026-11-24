// packages/main/src/api/common/code.ts
//
// 代码运行时（Code Runtime）对 renderer 暴露的 oRPC 接口。
//
// 约定：
//   - 所有接口都以 runtime id 为入参，不按语言拆分；
//   - 工具集定义统一收敛到 `code.cfg.ts`，本文件只保留状态推导与 procedure；
//   - 安装/卸载是"操作"而不是"状态同步"：启用即触发安装，进度通过
//     `task:update` 事件（由 `codeRuntimeManager` 推送）流式到达 renderer；
//   - 启用前会调用 `codeRuntimeManager.assertInstallable(id)` 做可用性校验：
//     内置下载源 / 用户自定义 archiveUrl / 系统已安装的运行时（Linux 与
//     macOS 的 aria2，以及各平台的 ffmpeg）三条来源都没有时**直接抛错**，
//     避免把配置写成 enabled 后异步失败、界面长期停在 preparing；
//   - **配置读取必须发生在 `assertInstallable()` 之后**：该调用是异步的，
//     期间另一个引擎可能已经启停并写盘。用进入 handler 时的快照会把那次
//     修改整体覆盖掉；
//   - **配置读写必须经过 `pickEngineConfig` / `buildEngineConfigs`**：
//     回写前把每个引擎收敛为 `CodeRuntimeEngineConfig` 的已知字段，避免
//     历史遗留键、值为 `undefined` 的键、手工编辑产生的脏值被扩散进新写入；
//   - **引擎清单不在此文件硬编码**：`buildEngineConfigs` 遍历
//     `CODE_RUNTIME_IDS`，新增引擎时本文件无需修改（类型由联合类型收敛）；
//   - `testRuntime` 复用运行时对应工具的执行链（`tool.inputSchema.parse`
//     + `tool.execute`），保证测试与正式执行完全一致；
//   - 工具类运行时（aria2 / ffmpeg）没有“代码”概念，测试统一跑各自版本
//     命令（见 `UTILITY_VERSION_ARGV`），由同一张表扩展；
//   - 所有对外暴露的 `id` 字段**必须**使用 `runtimeIdSchema`（闭集枚举），
//     否则 renderer 侧 `CodeRuntimeEntry.info.id` 的联合类型会退化为
//     `string`，导致严格赋值失败。

import { codeRuntimeManager } from "$libs/coderuntime/index.js";
import { stableConfig } from "$libs/store/stable.js";
import type {
    CodeRuntimeConfig,
    CodeRuntimeEngineConfig,
    CodeRuntimeEngineStatus,
} from "$types/appconfig.js";
import { os } from "@orpc/server";
import Logger from "electron-log/main.js";
import { execa } from "execa";
import { z } from "zod";
import {
    CODE_RUNTIME_IDS,
    RUNTIME_IDS,
    RUNTIME_INFO,
    isCodeRuntimeId,
    runtimeIdSchema,
    type CodeRuntimeId,
    type RuntimeId
} from "./code.cfg.js";

// ── 配置归一化 ──────────────────────────────────────────────────

/**
 * 把任意来源的引擎配置收敛为 `CodeRuntimeEngineConfig`。
 *
 * 存在的原因：这里的对象会被**整体回写**到 `stableConfig`，而回写前的
 * 现值可能来自旧版本 schema、手工编辑的 stable.json、或上一版代码写入的
 * 历史字段。收敛带来三点确定性：
 *   - 只保留接口声明的字段，避免未知键 / 废弃键被扩散进新写入；
 *   - 字符串字段丢弃空串与空白串（等价于"未配置"）；
 *   - `enabled` 始终产出布尔值，保证必填字段存在（schema 内
 *     `required: ['enabled']`，缺它会让整次 set 被拒绝）。
 *
 * 逐字段赋值而非循环赋值，是为了让类型收窄落在编译器可见的范围内，
 * 避免 `out[field] = value` 这类联合键写入的类型陷阱。
 */
function pickEngineConfig(raw: unknown): CodeRuntimeEngineConfig {
    const source = (
        raw !== null && typeof raw === "object" ? raw : {}
    ) as Record<string, unknown>;

    const out: CodeRuntimeEngineConfig = {
        enabled: source.enabled === true,
    };

    const put = (key: "version" | "archiveUrl" | "archiveSha256"
        | "extractStripPrefix" | "executableRelativePath" | "registry"): void => {
        const value = source[key];
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (!trimmed) return;
        out[key] = trimmed;
    };

    put("version");
    put("archiveUrl");
    put("archiveSha256");
    put("extractStripPrefix");
    put("executableRelativePath");
    put("registry");

    return out;
}

/**
 * 按**已知引擎清单**重建 `engines` 配置（全量、白名单字段、默认关闭）。
 *
 * 清单来自 `CODE_RUNTIME_IDS`，因此新增引擎时本文件无需改动。
 * 同时保证输出对象**四个键齐全**（`Record<CodeRuntimeEngineId, ...>` 的
 * 结构要求），使回写不依赖 store 里实际存在的键。
 */
function buildEngineConfigs(source: unknown): CodeRuntimeConfig["engines"] {
    const raw = (
        source !== null && typeof source === "object" ? source : {}
    ) as Record<string, unknown>;

    const out = {} as CodeRuntimeConfig["engines"];
    for (const id of CODE_RUNTIME_IDS) {
        // 编译期护栏：若 `CodeRuntimeId` 与 `CodeRuntimeEngineId` 的联合成员
        // 出现漂移，`out[id]` 会在这里报类型错误，而不是静默写入脏数据。
        out[id] = pickEngineConfig(raw[id]);
    }
    return out;
}

function readCodeRuntimeConfig(): CodeRuntimeConfig {
    const current = stableConfig().get("codeRuntime") as
        | CodeRuntimeConfig
        | undefined;

    return {
        engines: buildEngineConfigs(current?.engines),
    };
}

// ── Runtime 状态 schema ─────────────────────────────────────────

const runtimeStateSchema = z.object({
    id: runtimeIdSchema,
    status: z.enum(["disabled", "preparing", "ready", "failed"]),
    version: z.string().optional(),
    progress: z.number().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
});

const runtimeInfoSchema = z.object({
    id: runtimeIdSchema,
    name: z.string(),
    kind: z.enum(["language", "sandbox", "utility"]),
    tagline: z.string(),
    icon: z.string().optional(),
    // 必须声明：zod 默认 strip 未知字段，漏声明会让 badge 在输出校验时被丢弃。
    badge: z.string().optional(),
    approximateDownloadMB: z.number().optional(),
    testSnippet: z.string(),
    available: z.boolean().optional(),
});

const runtimeEntrySchema = z.object({
    info: runtimeInfoSchema,
    state: runtimeStateSchema,
});

const runtimeTestResultSchema = z.object({
    ok: z.boolean(),
    output: z.string(),
    elapsedMs: z.number().nonnegative(),
    error: z.string().optional(),
});

type RuntimeState = z.infer<typeof runtimeStateSchema>;
type RuntimeEntry = z.infer<typeof runtimeEntrySchema>;
type RuntimeTestResult = z.infer<typeof runtimeTestResultSchema>;

function toRuntimeState(
    id: CodeRuntimeId,
    engineCfg: CodeRuntimeEngineConfig | undefined,
    enabled: boolean,
): RuntimeState {
    if (!enabled) {
        return { id, status: "disabled" };
    }

    const status: CodeRuntimeEngineStatus =
        codeRuntimeManager.getState(id) ?? { state: "not_ready" };

    switch (status.state) {
        case "ready":
            return {
                id,
                status: "ready",
                version: status.verifiedVersion ?? engineCfg?.version,
            };

        case "installing":
            return {
                id,
                status: "preparing",
                progress: status.progress ?? 0,
                message: status.message ?? "正在准备…",
            };

        case "failed":
        case "interrupted":
            return {
                id,
                status: "failed",
                error:
                    status.lastError ??
                    status.message ??
                    "启动失败，请查看日志或重试。",
                progress: status.progress,
                message: status.message,
            };

        case "not_ready":
        default:
            return {
                id,
                status: "preparing",
                progress: status.progress ?? 0,
                message: status.message ?? "尚未安装，正在准备…",
            };
    }
}

function toRuntimeEntry(id: RuntimeId, cfg: CodeRuntimeConfig): RuntimeEntry {
    const info = RUNTIME_INFO[id];

    // 工具类入口目前只做 UI 预留；未托管到 codeRuntimeManager 之前始终展示 disabled。
    if (info.available === false || !isCodeRuntimeId(id)) {
        return {
            info,
            state: { id, status: "disabled" },
        };
    }

    const engineCfg = (
        cfg.engines as Record<string, CodeRuntimeEngineConfig | undefined>
    )[id];
    const enabled = engineCfg?.enabled === true;

    return {
        info,
        state: toRuntimeState(id, engineCfg, enabled),
    };
}

// ── Procedures ──────────────────────────────────────────────────

const listRuntimes = os
    .input(z.void())
    .output(z.array(runtimeEntrySchema))
    .handler(async () => {
        const cfg = readCodeRuntimeConfig();
        return RUNTIME_IDS.map((id) => toRuntimeEntry(id, cfg));
    });

const setRuntimeEnabled = os
    .input(
        z.object({
            id: runtimeIdSchema,
            enabled: z.boolean(),
        }),
    )
    .output(runtimeEntrySchema)
    .handler(async ({ input }) => {
        const info = RUNTIME_INFO[input.id];

        if (info.available === false) {
            throw new Error(
                `${info.name} 尚未接入主进程，当前仅完成界面预留。`,
            );
        }

        if (!isCodeRuntimeId(input.id)) {
            throw new Error(`${info.name} 暂不支持在此启用。`);
        }

        const id = input.id;

        if (input.enabled) {
            // 启用前校验运行时来源：内置下载源 / 用户自定义 archiveUrl /
            // 系统已安装的运行时（Linux 与 macOS 的 aria2、各平台的
            // ffmpeg 都可能属于这一类）。
            //
            // 放在写配置之前，未安装时直接抛出面向用户的错误（提示用户
            // 自行安装后重新启用），而不是把 enabled 落盘后异步失败。
            await codeRuntimeManager.assertInstallable(id);
        }

        // **必须**在 `assertInstallable()` 之后再读一次配置。
        //
        // 该调用是异步的（Linux / macOS 上要探测系统已安装的运行时），
        // 期间用户可能在另一个引擎上完成启停并已写盘。继续使用进入
        // handler 时的快照，会把那次修改连同它的 `engines.<other>` 一起
        // 覆盖回旧值 —— 典型表现是刚启用的引擎被“退回”未启用。
        //
        // `readCodeRuntimeConfig()` 已保证每个引擎都是白名单字段、键齐全，
        // 因此这里只需浅拷贝后覆盖目标引擎。
        const current = readCodeRuntimeConfig();
        const engines: CodeRuntimeConfig["engines"] = { ...current.engines };

        engines[id] = {
            ...engines[id],
            enabled: input.enabled,
        };

        const next: CodeRuntimeConfig = {
            engines,
        };

        stableConfig().set("codeRuntime", next);

        if (input.enabled) {
            // 启用：触发安装 → 完成后由 manager 自动注册工具。
            // 独立 fire-and-forget，不阻塞 UI 返回。
            //
            // 对 Linux / macOS 的 aria2、以及探测到系统 ffmpeg 的场景来说，
            // 这里的 ensureEngine 通常是快路径：assertReady 命中系统已安装
            // 的二进制，直接注册工具，不触发下载；manager 会为该快路径
            // 同样发送 `code-runtime:<id>` 的终态事件，renderer 据此收敛界面。
            void codeRuntimeManager.ensureEngine(id).catch((error: unknown) => {
                Logger.error(
                    `[CodeRuntime] 启用 ${id} 失败：${error instanceof Error ? error.message : String(error)
                    }`,
                );
            });
        } else {
            // 停用：manager 会先中断正在进行的安装（若存在），再自动注销工具。
            // 安装中断后 manager 会收敛状态并发送终态事件，renderer 无需
            // 定时器猜测注销 / 中断时机。
            void codeRuntimeManager.disableEngine(id).catch((error: unknown) => {
                Logger.warn(
                    `[CodeRuntime] 停用 ${id} 失败：${error instanceof Error ? error.message : String(error)
                    }`,
                );
            });
        }

        return toRuntimeEntry(id, next);
    });

/**
 * 工具类运行时的版本探针参数。
 *
 * 工具类运行时（不是代码运行时）没有“执行代码”的语义，其"测试一下"
 * 统一是验证二进制本身可用：各跑一次版本命令即可。
 *
 * 语言类运行时**不在**此表内，由下方 `executeTestCode` 的代码执行分支
 * 处理（`run_python` / `run_node`）。
 */
const UTILITY_VERSION_ARGV: Partial<Record<CodeRuntimeId, readonly string[]>> = {
    aria2: ["--version"],
    ffmpeg: ["-version"],
};

/**
 * 运行测试片段（"测试一下"按钮）。
 *
 * 复用工具的完整执行链（venv / 依赖安装 / 执行），确保测试等价于真实运行。
 * 不走正式工具注册表，因此不受"工具是否已注册"影响；但仍要求引擎处于
 * ready 且 config 已启用。
 */
const testRuntime = os
    .input(
        z.object({
            id: runtimeIdSchema,
            code: z.string().min(1),
        }),
    )
    .output(runtimeTestResultSchema)
    .handler(async ({ input }): Promise<RuntimeTestResult> => {
        const info = RUNTIME_INFO[input.id];

        if (info.available === false || !isCodeRuntimeId(input.id)) {
            return {
                ok: false,
                output: "",
                elapsedMs: 0,
                error: `${info.name} 暂不支持运行测试。`,
            };
        }

        const id = input.id;
        const cfg = readCodeRuntimeConfig();
        if (!cfg.engines[id]?.enabled) {
            return {
                ok: false,
                output: "",
                elapsedMs: 0,
                error: "代码环境尚未启用，请先开启。",
            };
        }

        try {
            await codeRuntimeManager.assertReady(id);
        } catch (err) {
            return {
                ok: false,
                output: "",
                elapsedMs: 0,
                error: `环境尚未就绪：${err instanceof Error ? err.message : String(err)
                    }`,
            };
        }

        const start = Date.now();
        try {
            const result = await executeTestCode(id, input.code);
            const elapsedMs = Date.now() - start;
            const combined = (result.stdout || result.stderr).trim();
            return {
                ok: result.exit_code === 0,
                output: combined || "（无输出）",
                elapsedMs,
                error:
                    result.exit_code === 0
                        ? undefined
                        : result.stderr?.trim() || "执行失败",
            };
        } catch (err) {
            return {
                ok: false,
                output: "",
                elapsedMs: Date.now() - start,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    });

interface ExecutedOutput {
    exit_code: number;
    stdout: string;
    stderr: string;
}

async function executeTestCode(
    id: CodeRuntimeId,
    code: string,
): Promise<ExecutedOutput> {
    const versionArgv = UTILITY_VERSION_ARGV[id];
    if (versionArgv) {
        // 工具类运行时：`code` 入参在这里不使用（UI 传的是展示用的
        // testSnippet），实际执行统一走版本命令，与工具层对二进制的
        // 使用方式一致。
        const runtime = await codeRuntimeManager.assertReady(id);
        const result = await execa(runtime.executablePath, [...versionArgv], {
            reject: false,
            windowsHide: true,
            timeout: 15_000,
        });
        return {
            exit_code:
                typeof result.exitCode === "number" ? result.exitCode : -1,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
        };
    }

    if (id === "python") {
        const mod = await import("$libs/coderuntime/tools/python.js");
        const input = mod.pythonRunTool.inputSchema.parse({ code });
        const out = await mod.pythonRunTool.execute(input);
        return {
            exit_code: out.exit_code,
            stdout: out.stdout,
            stderr: out.stderr,
        };
    }
    const mod = await import("$libs/coderuntime/tools/nodejs.js");
    const input = mod.nodeRunTool.inputSchema.parse({ code });
    const out = await mod.nodeRunTool.execute(input);
    return {
        exit_code: out.exit_code,
        stdout: out.stdout,
        stderr: out.stderr,
    };
}

export default {
    listRuntimes,
    setRuntimeEnabled,
    testRuntime,
};