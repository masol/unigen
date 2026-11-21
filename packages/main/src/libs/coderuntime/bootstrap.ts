// packages/main/src/libs/coderuntime/bootstrap.ts
//
// 启动期编排：
//   1. 读 codeRuntime 总开关；关闭时直接返回（默认关闭）。
//   2. 对每个 enabled 的引擎：
//        - ensureEngine（下载 / 解压 / 验证）；
//        - ready → 注册对应工具；
//        - 失败 → 写 warn、记录日志、继续处理其它引擎（不阻塞启动）。
//   3. 进度通过 getStartupProgress() 回传给 TaskProgressService，
//      渲染进程消费 `task:update` 即可看到整体进度。
//
// 注意：
//   - 注册工具依赖 globalToolDB 已 init 完成；
//   - 引擎状态会写入 secondConfig.current.codeRuntimeState.engines，
//     renderer 侧可直接读取来渲染"哪些运行时已启用/就绪"。

import { secondConfig } from "$libs/store/second.js";
import { globalToolDB } from "$libs/tooldb/globaltooldb.js";
import { getStartupProgress } from "$libs/utils/task-progress.js";
import type { CodeRuntimeEngineId } from "$types/appconfig.js";
import Logger from "electron-log/main.js";
import { isKnownEngine, KNOWN_ENGINE_IDS } from "./engines/index.js";
import { codeRuntimeManager } from "./manager.js";
import { nodeRunTool } from "./tools/nodejs.js";
import { pythonRunTool } from "./tools/python.js";

const TOOL_BY_ENGINE: Record<CodeRuntimeEngineId, typeof pythonRunTool | typeof nodeRunTool> = {
    python: pythonRunTool,
    nodejs: nodeRunTool,
};

export async function bootstrapCodeRuntime(): Promise<void> {
    const cfg = secondConfig().get("codeRuntime");
    if (!cfg?.enabled) {
        Logger.log("[CodeRuntime] 总开关未启用，跳过初始化。");
        return;
    }

    const progress = getStartupProgress();
    const enginesCfg = cfg.engines ?? {};

    const enabledIds = KNOWN_ENGINE_IDS.filter(
        (id) => isKnownEngine(id) && enginesCfg[id]?.enabled,
    );
    if (enabledIds.length === 0) {
        progress.report(
            "code-runtime",
            "代码运行时总开关已启用，但没有启用具体引擎。",
            100,
        );
        return;
    }

    let failureCount = 0;
    for (const id of enabledIds) {
        try {
            progress.report(
                `code-runtime.${id}.starting`,
                `正在初始化 ${id} 运行时...`,
                0,
            );

            await codeRuntimeManager.ensureEngine(id, {
                report: (phase, message, p) => {
                    progress.report(`code-runtime.${id}.${phase}`, message, p);
                },
                warn: (w) => progress.warn(w),
            });

            await globalToolDB.register(TOOL_BY_ENGINE[id]);
            Logger.log(`[CodeRuntime] 工具 ${TOOL_BY_ENGINE[id].name} 已注册。`);
        } catch (error) {
            failureCount += 1;
            const message =
                error instanceof Error ? error.message : String(error);
            Logger.error(`[CodeRuntime] ${id} 初始化失败：${message}`);
            progress.warn({
                id: `code-runtime.${id}.failed`,
                level: "error",
                code: "code-runtime.failed",
                message: `代码运行时 ${id} 初始化失败，相关工具本次未注册。`,
                detail: message,
            });
        }
    }

    progress.report(
        "code-runtime",
        failureCount === 0
            ? "代码运行时初始化完成。"
            : `代码运行时初始化完成，${failureCount} 个引擎失败（详见警告）。`,
        100,
    );
}