import { createMCPClient } from "@ai-sdk/mcp";
// stdio 传输的子路径导出名请以你本地 @ai-sdk/mcp 的实际导出为准,
// 若报无此导出,查看 node_modules/@ai-sdk/mcp/package.json 的 exports 字段
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import type { McpServerConfig } from "./type.js";

export type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

export interface McpConnection {
    client: McpClient;
    /**
     * client.tools() 的返回值:已是标准 AI SDK Tool,execute 内部代理到远端 MCP server。
     * "MCP → Tool 的转化"即发生在此处,下游拿到即用。
     */
    tools: Record<string, Tool>;
}

export async function connectMcpServer(cfg: McpServerConfig): Promise<McpConnection> {
    const t = cfg.transport;
    let client: McpClient;

    switch (t.type) {
        // v7 起 http(Streamable HTTP)与 sse 均为内置传输,直接配置对象即可
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
    Logger.debug(`[ToolDB] MCP [${cfg.id}] 已连接,发现 ${Object.keys(tools).length} 个工具。`);
    return { client, tools };
}

export async function closeMcpClient(id: string, client: McpClient): Promise<void> {
    try {
        await client.close();
    } catch (e) {
        Logger.warn(`[ToolDB] MCP [${id}] 关闭异常:`, e);
    }
}