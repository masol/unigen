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
//     macOS 的 aria2）三条来源都没有时**直接抛错**，避免把配置写成
//     enabled 后异步失败、界面长期停在 preparing；
//   - **配置读取必须发生在 `assertInstallable()` 之后**：该调用是异步的，
//     期间另一个引擎可能已经启停并写盘。用进入 handler 时的快照会把那次
//     修改整体覆盖掉；
//   - **配置读写必须经过 `pickEngineConfig`**：持久化 schema 对
//     `codeRuntime.engines.<id>` 是严格的（未知键会被 `unrecognized_keys`
//     拒绝）。任何从 store 读出的引擎配置都只能以
//     `CodeRuntimeEngineConfig` 的已知字段重新构造后再写回，否则历史
//     遗留键 / 值为 `undefined` 的键会让整个 `set("codeRuntime", ...)` 失败；
//   - `testRuntime` 复用运行时对应工具的执行链（`tool.inputSchema.parse`
//     + `tool.execute`），保证测试与正式执行完全一致；
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
 * 存在的原因：持久化 schema 对 `codeRuntime.engines.<id>` 做了严格校验，
 * 而 store 里可能残留历史字段、或值为 `undefined` 的键（zod 的 strict
 * 校验对"键存在但值为 undefined"同样会报 `unrecognized_keys`）。只要
 * 把读到的对象原样 spread 回写，`set("codeRuntime", ...)` 就会被拒绝，
 * 报错形如：
 *
 *   Config schema violation: `codeRuntime/engines/aria2` must NOT have
 *   additional properties
 *
 * 因此这里做一次显式白名单重建：
 *   - 只保留接口声明的字段；
 *   - 字符串字段丢弃空串与空白串（等价于"未配置"）；
 *   - `enabled` 始终产出布尔值，保证必填字段存在。
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

function readCodeRuntimeConfig(): CodeRuntimeConfig {
    const current = stableConfig().get("codeRuntime") as
        | CodeRuntimeConfig
        | undefined;

    return {
        engines: {
            python: pickEngineConfig(current?.engines?.python),
            nodejs: pickEngineConfig(current?.engines?.nodejs),
            aria2: pickEngineConfig(current?.engines?.aria2),
        },
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
            // 系统已安装的运行时（Linux 与 macOS 的 aria2 属于这一类）。
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
        const current = readCodeRuntimeConfig();

        // 三个引擎统一走白名单重建：只要有一个引擎带着 schema 未声明的键，
        // 整个 `set("codeRuntime", ...)` 都会被拒绝（zod 的 unrecognized_keys
        // 报错路径会指向那个引擎）。因此不能"只清洗被修改的那一个"。
        const engines: CodeRuntimeConfig["engines"] = {
            python: pickEngineConfig(current.engines.python),
            nodejs: pickEngineConfig(current.engines.nodejs),
            aria2: pickEngineConfig(current.engines.aria2),
        };

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
            // 对 Linux / macOS 的 aria2 来说，这里的 ensureEngine 通常是
            // 快路径：assertReady 命中系统已安装的 aria2c，直接注册工具，
            // 不触发下载；manager 会为该快路径同样发送
            // `code-runtime:aria2` 的终态事件，renderer 据此收敛界面。
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
 * 运行测试片段（"测试一下"按钮）。
 *
 * 复用工具的完整执行链（venv / 依赖安装 / 执行），确保测试等价于真实运行。
 * 不走正式工具注册表，因此不受"工具是否已注册"影响；但仍要求引擎处于
 * ready 且 config 已启用。
 *
 * 语言类与工具类都支持：aria2 固定执行 `aria2c --version`（见
 * `executeTestCode`）；语言类执行引擎给出的 `testSnippet` 代码。
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
    if (id === "aria2") {
        // 工具类运行时的"测试"是验证二进制本身可用：`code` 入参在
        // aria2 分支不使用（UI 固定传 `aria2c --version`）。
        const runtime = await codeRuntimeManager.assertReady("aria2");
        const result = await execa(runtime.executablePath, ["--version"], {
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