// packages/main/src/libs/mcp/client.ts
import { createMCPClient } from "@ai-sdk/mcp";
// stdio 传输的子路径导出名请以本地 @ai-sdk/mcp 实际导出为准。
import type {
    McpConnectionTestResult,
    McpTestServerConfig,
    McpToolInfo,
} from "$types/shared/mcp.js";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { isFunction } from "radashi";
import type { McpServerConfig } from "./type.js";

export type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

export interface McpConnection {
    client: McpClient;
    tools: Record<string, Tool>;
}

export async function connectMcpServer(
    cfg: McpServerConfig,
): Promise<McpConnection> {
    const t = cfg.transport;
    let client: McpClient;

    switch (t.type) {
        case "http": {
            client = await createMCPClient({
                transport: { type: "http", url: t.url, headers: t.headers },
            });
            break;
        }
        case "sse": {
            client = await createMCPClient({
                transport: { type: "sse", url: t.url, headers: t.headers },
            });
            break;
        }
        case "stdio": {
            client = await createMCPClient({
                transport: new StdioMCPTransport({
                    command: t.command,
                    args: t.args,
                    env: t.env,
                    cwd: t.cwd,
                }),
            });
            break;
        }
    }

    try {
        const tools = (await client.tools()) as Record<string, Tool>;
        Logger.debug(
            `[MCP] [${cfg.id}] 已连接，发现 ${Object.keys(tools).length} 个工具。`,
        );
        return { client, tools };
    } catch (e) {
        await closeMcpClient(cfg.id, client);
        throw e;
    }
}

export async function closeMcpClient(
    serverId: string,
    client: McpClient,
): Promise<void> {
    try {
        await client.close();
    } catch (e) {
        Logger.warn(`[MCP] [${serverId}] 关闭异常:`, e);
    }
}

/** 从一个 AI SDK Tool 的 description 字段中静态化出字符串（可能是函数形式） */
export function resolveMcpToolDescription(t: Tool): string {
    const d = (t as { description?: unknown }).description;
    if (typeof d === "string") return d;
    if (isFunction(d)) {
        try {
            const r = (d as (options: { context: unknown }) => string)({
                context: undefined,
            });
            return typeof r === "string" ? r : "";
        } catch {
            return "";
        }
    }
    return "";
}

/**
 * 测试 MCP server 连接。
 *
 * - 该函数只创建临时连接、读取工具列表并立即关闭；
 * - 不经过 McpConnectionPool，不会写入 / 修改任何 server 配置或连接池状态；
 * - 接受 id / name 可缺失的配置，便于客户端在“保存前”测试。
 */
export async function testMcpServerConnection(
    cfg: McpTestServerConfig,
): Promise<McpConnectionTestResult> {
    const startedAt = Date.now();
    const serverId = cfg.id || cfg.name || "<mcp-test>";
    let client: McpClient | undefined;

    try {
        const connection = await connectMcpServer({ ...cfg, id: serverId });
        client = connection.client;

        const tools: McpToolInfo[] = Object.entries(connection.tools).map(
            ([name, tool]) => ({
                name,
                description: resolveMcpToolDescription(tool) || undefined,
            }),
        );

        return {
            ok: true,
            latencyMs: Date.now() - startedAt,
            tools,
        };
    } catch (e) {
        return {
            ok: false,
            latencyMs: Date.now() - startedAt,
            tools: [],
            error: e instanceof Error ? e.message : String(e),
        };
    } finally {
        if (client) {
            await closeMcpClient(serverId, client);
        }
    }
}