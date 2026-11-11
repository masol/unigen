import { appLife } from "$libs/utils/tapable/applife.js";
import Logger from "electron-log/main.js";
import { getBuiltinTools } from "./builtins.js";
import { globalToolDB } from "./globaltooldb.js";

let initialized = false;

/**
 * 应用启动期的一次性入口。
 *
 * 只负责 builtin / meta 工具注入与生命周期钩子。
 * MCP 配置、连接、发现由外部（mcp-sync 的 bootMcpTools）负责；
 * tooldb 只被动接收 replaceMcpServerTools / removeMcpServerTools。
 *
 * 工具检索入 searchsrv 由外部在初始化流程中调用
 * syncToolsToSearchDB() 完成。
 */
export async function initGlobalToolDB(): Promise<void> {
    if (initialized) return;
    initialized = true;

    await globalToolDB.init({
        builtins: getBuiltinTools(),
    });

    appLife.beforeQuit.tapPromise("GlobalToolDB", async () => {
        Logger.debug("[ToolDB] 正在清理资源...");
        await globalToolDB.close();
        Logger.debug("[ToolDB] 清理资源完成。");
    });
}