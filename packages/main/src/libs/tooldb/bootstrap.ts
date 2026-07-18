import { appLife } from "$libs/utils/tapable/applife.js";
import Logger from "electron-log/main.js";
import { getBuiltinTools } from "./builtins.js";
import { globalToolDB } from "./globaltooldb.js";
import type { McpServerConfig } from "./type.js";

let initialized = false;

/**
 * 初始化全局工具库(应用级,一次性)。
 *
 * 调用时机:主进程 app.whenReady() 之后、configService 就绪之后
 * (嵌入模型初始化需要读取 embed_model 配置)。不依赖任何项目打开。
 *
 * 行为:
 * 1. 加载 builtins.ts 中的全部内置工具并打开数据库
 *    (嵌入模型未配置时自动降级为 Fuse 检索,不会失败);
 * 2. 向 appLife.beforeQuit 自注册销毁钩子,调用方无需关心清理;
 * 3. 若传入 mcpServers(configService 读出的持久化配置),完成全量对齐;
 *    也可不传,由 configService 稍后自行调用 globalToolDB.setMcpServers()。
 *
 * 幂等:重复调用直接返回。
 *
 * @returns MCP 连接失败的 serverId 列表(未传 mcpServers 时恒为空),供上层提示用户
 */
export async function initGlobalToolDB(
    mcpServers?: McpServerConfig[],
): Promise<{ failed: string[] }> {
    if (initialized) return { failed: [] };
    initialized = true;

    await globalToolDB.open(getBuiltinTools());

    appLife.hooks.beforeQuit.tapPromise("GlobalToolDB", async () => {
        Logger.debug("[ToolDB] 正在清理资源...");
        await globalToolDB.close();
        Logger.debug("[ToolDB] 清理资源完成。");
    });

    if (mcpServers && mcpServers.length > 0) {
        return globalToolDB.setMcpServers(mcpServers);
    }
    return { failed: [] };
}