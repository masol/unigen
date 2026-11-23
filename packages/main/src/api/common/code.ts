// packages/main/src/api/common/code.ts
//
// 代码运行时（Code Runtime）对 renderer 暴露的 oRPC 接口。
//
// 约定：
//   - 所有接口都以 runtime id 为入参，不按语言拆分；
//   - 安装/卸载是"操作"而不是"状态同步"：启用即触发安装，进度通过
//     `task:update` 事件（由 `codeRuntimeManager` 推送）流式到达 renderer；
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
import { z } from "zod";

// ── Runtime 元信息与状态 ────────────────────────────────────────

const runtimeIdSchema = z.enum(["python", "nodejs"]);
type RuntimeId = z.infer<typeof runtimeIdSchema>;

const RUNTIME_IDS: RuntimeId[] = ["python", "nodejs"];

interface RuntimeInfo {
    id: RuntimeId;
    name: string;
    kind: "language" | "sandbox";
    tagline: string;
    icon?: string;
    approximateDownloadMB?: number;
    /** 就绪后点击"测试一下"运行的代码片段 */
    testSnippet: string;
}

const RUNTIME_INFO: Record<RuntimeId, RuntimeInfo> = {
    python: {
        id: "python",
        name: "Python",
        kind: "language",
        // 描述保持笼统：语言本身做的事太多、不同用户场景差异巨大，
        // 唯一稳定让用户理解的价值就是「让 AI 可以使用这门语言、并调用其生态」。
        tagline: "让 AI 使用 Python 工作，并利用 Python 生态。",
        icon: "IconBrandPython",
        approximateDownloadMB: 120,
        testSnippet: "print(1 + 1)",
    },
    nodejs: {
        id: "nodejs",
        name: "Node.js",
        kind: "language",
        tagline: "让 AI 使用 Node.js 工作，并利用 npm 生态。",
        icon: "IconBrandNodejs",
        approximateDownloadMB: 60,
        testSnippet: "console.log(1 + 1)",
    },
};

/**
 * ⚠️ 关键：`id` 必须使用 `runtimeIdSchema`（闭集），而不是 `z.string()`。
 *
 * oRPC 会从 `os.output(schema)` 推导 renderer 侧类型；一旦放宽为 `string`，
 * `CodeRuntimeInfo.id` 的 `CodeRuntimeId` 联合类型将不再匹配，引发
 * `Type 'string' is not assignable to type 'CodeRuntimeId'` 的编译错误。
 */
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
    kind: z.enum(["language", "sandbox"]),
    tagline: z.string(),
    icon: z.string().optional(),
    approximateDownloadMB: z.number().optional(),
    testSnippet: z.string(),
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

function readCodeRuntimeConfig(): CodeRuntimeConfig {
    const current = stableConfig().get("codeRuntime") as
        | CodeRuntimeConfig
        | undefined;

    const engines: CodeRuntimeConfig["engines"] = {
        python: {
            enabled: false,
            ...(current?.engines?.python ?? {}),
        },
        nodejs: {
            enabled: false,
            ...(current?.engines?.nodejs ?? {}),
        },
    };

    return {
        enabled:
            current?.enabled ??
            Object.values(engines).some((engine) => engine.enabled),
        engines,
    };
}

function toRuntimeState(
    id: RuntimeId,
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
    const engineCfg = cfg.engines[id];
    const enabled = Boolean(cfg.enabled && engineCfg?.enabled);

    return {
        info: RUNTIME_INFO[id],
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
        const current = readCodeRuntimeConfig();

        const engines: CodeRuntimeConfig["engines"] = {
            ...current.engines,
            [input.id]: {
                ...(current.engines[input.id] ?? { enabled: false }),
                enabled: input.enabled,
            },
        };

        const anyEnabled = RUNTIME_IDS.some(
            (id) => engines[id]?.enabled === true,
        );

        const next: CodeRuntimeConfig = {
            enabled: input.enabled ? true : current.enabled && anyEnabled,
            engines,
        };

        stableConfig().set("codeRuntime", next);

        if (input.enabled) {
            // 启用：触发安装 → 完成后由 manager 自动注册工具。
            // 独立 fire-and-forget，不阻塞 UI 返回。
            void codeRuntimeManager
                .ensureEngine(input.id)
                .catch((error: unknown) => {
                    Logger.error(
                        `[CodeRuntime] 启用 ${input.id} 失败：${error instanceof Error
                            ? error.message
                            : String(error)
                        }`,
                    );
                });
        } else {
            // 停用：自动化注销工具。
            void codeRuntimeManager
                .disableEngine(input.id)
                .catch((error: unknown) => {
                    Logger.warn(
                        `[CodeRuntime] 停用 ${input.id} 失败：${error instanceof Error
                            ? error.message
                            : String(error)
                        }`,
                    );
                });
        }

        return toRuntimeEntry(input.id, next);
    });

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
        const cfg = readCodeRuntimeConfig();
        if (!cfg.enabled || !cfg.engines[input.id]?.enabled) {
            return {
                ok: false,
                output: "",
                elapsedMs: 0,
                error: "代码环境尚未启用，请先开启。",
            };
        }

        try {
            await codeRuntimeManager.assertReady(input.id);
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
            const result = await executeTestCode(input.id, input.code);
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
    id: RuntimeId,
    code: string,
): Promise<ExecutedOutput> {
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