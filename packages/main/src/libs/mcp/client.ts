// packages/main/src/libs/mcp/client.ts
import { createMCPClient } from "@ai-sdk/mcp";
// stdio 传输的子路径导出名请以本地 @ai-sdk/mcp 实际导出为准。
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

    const tools = (await client.tools()) as Record<string, Tool>;
    Logger.debug(
        `[MCP] [${cfg.id}] 已连接，发现 ${Object.keys(tools).length} 个工具。`,
    );
    return { client, tools };
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