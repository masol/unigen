// packages/main/src/libs/mcp/sync.ts
// packages/main/src/libs/mcp/sync.ts
import type {
    McpRoute,
    McpServerConfig,
    McpToolDescriptor,
    SetServersResult,
} from "$libs/mcp/index.js";
import { stableStringify } from "$libs/mcp/index.js";
import type { GlobalToolDB } from "$libs/tooldb/index.js";
import Logger from "electron-log/main.js";

export interface SyncMcpToolsResult {
    failed: string[];
}

// ─────────────────────────────────────────────────────────────
// 底层原语
// ─────────────────────────────────────────────────────────────

async function discoverAndRegister(
    mcp: McpRoute,
    tooldb: GlobalToolDB,
    serverId: string,
): Promise<void> {
    const descriptors: McpToolDescriptor[] =
        await mcp.discoverTools(serverId);
    await tooldb.replaceMcpServerTools(serverId, descriptors);
}

/** 遍历 serverIds，逐个 discover + 注册到 tooldb。失败隔离。 */
export async function syncMcpToolsToToolDB(
    mcp: McpRoute,
    tooldb: GlobalToolDB,
    serverIds: readonly string[],
): Promise<SyncMcpToolsResult> {
    const failed: string[] = [];
    for (const id of serverIds) {
        try {
            await discoverAndRegister(mcp, tooldb, id);
        } catch (e) {
            failed.push(id);
            Logger.error(`[MCP-Sync] [${id}] 同步工具失败:`, e);
        }
    }
    return { failed };
}

/** 从 tooldb 移除若干 server 的全部工具（内存 + 持久化）。 */
export async function removeMcpToolsFromToolDB(
    tooldb: GlobalToolDB,
    serverIds: readonly string[],
): Promise<void> {
    for (const id of serverIds) {
        try {
            await tooldb.removeMcpServerTools(id);
        } catch (e) {
            Logger.error(`[MCP-Sync] [${id}] 移除工具失败:`, e);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 编排：启动期 / 配置变更
// ─────────────────────────────────────────────────────────────

/**
 * 启动期编排。
 *
 * 只对“持久化缺失或配置指纹变化”的启用 server 调 discoverTools：
 * - 首次启动 / LanceDB 被清空：所有启用 server 持久化缺失 → discover；
 * - 非首次启动且配置未变化：已有 MCP 元数据 → 不连接，保持懒加载；
 * - 停机期间配置变化：持久化指纹与当前 stableStringify(cfg) 不一致 → discover；
 * - 配置删除 / 禁用：从 tooldb 移除对应元数据。
 *
 * 注意：不能使用 `mcp.init()` 返回的 `changes.changed` 判断启动期是否 discover。
 * 新进程里 McpConnectionPool 的配置表为空，`init()` 会把所有 server 都标成 changed，
 * 从而在每次启动时连接全部 MCP。
 */
export async function bootMcpTools(
    mcp: McpRoute,
    tooldb: GlobalToolDB,
    servers: readonly McpServerConfig[],
): Promise<SyncMcpToolsResult> {
    await mcp.init([...servers]);

    const persisted = await tooldb.listMcpServerStates();
    const persistedServers = new Set(persisted.keys());
    const enabledServers = servers.filter((s) => s.enabled !== false);
    const enabledIds = new Set(enabledServers.map((s) => s.id));

    // 持久化中存在，但当前配置已删除 / 禁用的 server，移除其 MCP 工具元数据。
    const removed = [...persistedServers].filter(
        (id) => !enabledIds.has(id),
    );
    await removeMcpToolsFromToolDB(tooldb, removed);

    // 启动期以“持久化是否存在 + 配置指纹是否一致”为准：
    // - 首次 / 新增 server → discover；
    // - 停机期间配置变化 → discover；
    // - 已持久化且指纹一致 → 不连接，等待真实检索 / 调用时懒加载。
    const toDiscover = enabledServers
        .filter((server) => {
            const fingerprint = persisted.get(server.id);
            return (
                !fingerprint ||
                fingerprint !== stableStringify(server)
            );
        })
        .map((server) => server.id);

    return syncMcpToolsToToolDB(mcp, tooldb, toDiscover);
}

/**
 * 配置变更编排。
 *
 * 直接消费 `mcpRoute.setServers` 的 diff：
 * - removed：从 tooldb 移除；
 * - changed：discover + 更新 tooldb；
 * - unchanged：不动。
 */
export async function applyMcpChanges(
    mcp: McpRoute,
    tooldb: GlobalToolDB,
    changes: SetServersResult,
): Promise<SyncMcpToolsResult> {
    await removeMcpToolsFromToolDB(tooldb, changes.removed);
    return syncMcpToolsToToolDB(mcp, tooldb, changes.changed);
}