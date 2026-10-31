import { appLife } from "$libs/utils/tapable/applife.js";
import Logger from "electron-log/main.js";
import { getBuiltinTools } from "./builtins.js";
import { globalToolDB } from "./globaltooldb.js";
import type { McpServerConfig } from "./type.js";

let initialized = false;

/**
 * 应用启动期的一次性入口。
 * - 注入 builtins / 目录加载(目录由调用方决定);
 * - 对齐 MCP 到当前持久化配置;
 * - 注册 beforeQuit 清理钩子。
 */
export async function initGlobalToolDB(
    mcpServers?: McpServerConfig[],
    toolDirs?: string[],
): Promise<{ failed: string[] }> {
    if (initialized) return { failed: [] };
    initialized = true;

    const { mcpFailed } = await globalToolDB.init({
        builtins: getBuiltinTools(),
        toolDirs,
        mcpServers,
    });

    appLife.beforeQuit.tapPromise("GlobalToolDB", async () => {
        Logger.debug("[ToolDB] 正在清理资源...");
        await globalToolDB.close();
        Logger.debug("[ToolDB] 清理资源完成。");
    });

    return { failed: mcpFailed };
}