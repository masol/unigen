// packages/main/src/libs/mcp/client.ts
import { createMCPClient } from "@ai-sdk/mcp";
// stdio 传输的子路径导出名请以本地 @ai-sdk/mcp 实际导出为准。
import type {
    McpConnectionTestResult,
    McpServerInfo,
    McpTestServerConfig,
    McpToolInfo,
} from "$types/shared/mcp.js";
import { StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { performance } from "node:perf_hooks";
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

/** 读取字符串字段：非字符串 / 全空白一律视为“未提供”。 */
function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 同步读取握手阶段上报的 server 身份信息。
 *
 * `@ai-sdk/mcp` v2 在 `createMCPClient()` resolve 之前已完成 initialize /
 * server/discover，因此 `client.serverInfo` 可直接读取。但服务端返回的结构
 * 不受控，这里做一次运行时校验 + 回退：
 *
 * - name：服务端自报名称 → 服务端自报版本号 → 传输协议名（http / sse / stdio）
 * - version：服务端自报版本号 → "unknown"
 *
 * 拿不到 serverInfo（老版本 SDK、非标准服务端）时返回 undefined，
 * 调用方必须视作连接失败。
 */
function resolveServerInfo(
    client: McpClient,
    transportType: string,
): McpServerInfo | undefined {
    const raw = (client as { serverInfo?: unknown }).serverInfo;
    if (!raw || typeof raw !== "object") return undefined;

    const info = raw as Record<string, unknown>;
    const version = readOptionalString(info.version);
    const title = readOptionalString(info.title);
    const name = readOptionalString(info.name) ?? version ?? transportType;

    return {
        name,
        version: version ?? "unknown",
        ...(title ? { title } : {}),
    };
}

/** 读取 initialize 结果里的协议版本号，读不到就返回 undefined。 */
function resolveProtocolVersion(client: McpClient): string | undefined {
    const init = (
        client as { initializeResult?: { protocolVersion?: unknown } }
    ).initializeResult;
    return readOptionalString(init?.protocolVersion);
}

/**
 * 测试 MCP server 连接。
 *
 * - 只创建临时连接、读取 serverInfo / 工具列表并立即关闭；
 * - 不经过 McpConnectionPool，不会写入 / 修改任何 server 配置或连接池状态；
 * - 接受 id / name 可缺失的配置，便于客户端在“保存前”测试。
 *
 * 契约：
 * - 连接成功且能拿到 serverInfo → `ok: true`，`serverInfo` 必填；
 * - 连接失败或拿不到 serverInfo   → `ok: false`，`error` 必填。
 */
export async function testMcpServerConnection(
    cfg: McpTestServerConfig,
): Promise<McpConnectionTestResult> {
    const startedAt = performance.now();
    const serverId =
        readOptionalString(cfg.id) ??
        readOptionalString(cfg.name) ??
        "<mcp-test>";
    let client: McpClient | undefined;

    try {
        const connection: McpConnection = await connectMcpServer({
            ...cfg,
            id: serverId,
        });
        client = connection.client;

        const serverInfo = resolveServerInfo(client, cfg.transport.type);
        if (!serverInfo) {
            throw new Error(
                `MCP server 未上报握手信息（serverInfo）: ${serverId}`,
            );
        }

        const tools: McpToolInfo[] = Object.entries(connection.tools).map(
            ([name, tool]) => {
                const description = resolveMcpToolDescription(tool);
                return description ? { name, description } : { name };
            },
        );

        const protocolVersion = resolveProtocolVersion(client);

        return {
            ok: true,
            latencyMs: Math.round(performance.now() - startedAt),
            serverInfo,
            tools,
            ...(protocolVersion ? { protocolVersion } : {}),
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - startedAt),
            tools: [],
            error: message || "MCP 连接测试失败",
        };
    } finally {
        if (client) {
            await closeMcpClient(serverId, client);
        }
    }
}