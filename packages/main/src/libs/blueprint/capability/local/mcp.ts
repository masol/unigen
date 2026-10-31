import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import type { LocalMcpConfig, LocalMcpToolInfo } from "./type.js";

export type LocalMcpClient = Awaited<ReturnType<typeof createMCPClient>>;

/**
 * 编译期:尝试连接获取元数据,超时或失败返回占位符。
 * 占位符的 inputSchema 为 undefined,渲染工具目录时会提示参数未知。
 * 
 * 超时设为 3 秒(而非 5 秒)以减少编译期累积延迟。
 */
export async function probeMcpMetadata(
    cfg: LocalMcpConfig,
    timeoutMs = 3000,
): Promise<LocalMcpToolInfo[]> {
    let client: LocalMcpClient | null = null;
    try {
        client = await Promise.race([
            connectLocalMcp(cfg),
            new Promise<never>((_, rej) =>
                setTimeout(() => rej(new Error("连接超时")), timeoutMs),
            ),
        ]);
        const tools = (await client.tools()) as Record<string, Tool>;
        const names = cfg.include ?? Object.keys(tools);
        const out: LocalMcpToolInfo[] = [];
        for (const name of names) {
            const t = tools[name];
            if (!t) continue;
            const desc = readToolDescription(t);
            const schema = (t as { inputSchema?: unknown }).inputSchema;
            out.push({ name, description: desc, inputSchema: schema });
        }
        return out;
    } catch (e) {
        Logger.warn(`[PAC] 局部 MCP 编译期探测失败(将用占位符):`, e);
        const names = cfg.include ?? ["unknown_tool"];
        return names.map((name) => ({
            name,
            description: `MCP 工具(编译期连接失败,运行时加载)`,
            // inputSchema 留空,buildToolDoc 会提示参数未知
        }));
    } finally {
        if (client) {
            try {
                await client.close();
            } catch {
                void (0);
            }
        }
    }
}

/** 运行期:连接并返回 client */
export async function connectLocalMcp(cfg: LocalMcpConfig): Promise<LocalMcpClient> {
    const t = cfg.transport;
    let client: LocalMcpClient;

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

    return client;
}

/** 从 Tool.description 中提取字符串 */
function readToolDescription(t: Tool): string {
    const d = (t as { description?: unknown }).description;
    if (typeof d === "string") return d;
    if (typeof d === "function") {
        try {
            const r = (d as (o: { context: unknown }) => unknown)({ context: undefined });
            return typeof r === "string" ? r : "";
        } catch {
            return "";
        }
    }
    return "";
}