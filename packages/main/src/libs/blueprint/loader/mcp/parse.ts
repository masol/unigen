// 加载MCP配置。

import { parseJsonc, safeParseJsonc } from '$libs/utils/jsonc.js';
import {
    mcpServerConfigSchema,
    mcpTransportSchema,
    type McpServerConfig,
    type McpTransport,
} from '$types/shared/mcp.js';

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * SEP-2633 推荐 streamable-http，http 作为别名。
 * 但项目里的 mcpHttpTransportSchema 只声明了 literal('http')，
 * 这里在校验前做归一化，输出统一为 "http"。
 */
function normalizeTransport(raw: unknown): unknown {
    if (isObject(raw) && raw.type === 'streamable-http') {
        return { ...raw, type: 'http' };
    }
    return raw;
}

function parseTransport(raw: unknown): McpTransport | null {
    const result = mcpTransportSchema.safeParse(normalizeTransport(raw));
    return result.success ? result.data : null;
}

function isTransportLike(v: unknown): v is JsonObject {
    return (
        isObject(v) &&
        (v.type === 'stdio' ||
            v.type === 'sse' ||
            v.type === 'http' ||
            v.type === 'streamable-http')
    );
}

/**
 * 将单个服务器条目归一化为 McpServerConfig。
 *
 * 支持两种形态：
 * 1. MCP 标准条目：{ type, command/url, ... }
 * 2. 已包装条目：{ id?, name?, enabled?, transport: { ... } }
 */
function coerceServerEntry(
    raw: unknown,
    fallbackId: string
): McpServerConfig | null {
    if (!isObject(raw)) return null;

    const id = nonEmptyString(raw.id) ?? fallbackId;
    const name = nonEmptyString(raw.name);
    const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : undefined;

    let transportRaw: unknown;

    if ('transport' in raw) {
        transportRaw = raw.transport;
    } else if (isTransportLike(raw)) {
        // 去掉服务器元数据，其余字段交给 transport schema 严格校验
        const rest: JsonObject = { ...raw };
        delete rest.id;
        delete rest.name;
        delete rest.enabled;
        transportRaw = rest;
    } else {
        return null;
    }

    const transport = parseTransport(transportRaw);
    if (!transport) return null;

    const candidate: JsonObject = { id, transport };
    if (name !== undefined) candidate.name = name;
    if (enabled !== undefined) candidate.enabled = enabled;

    const result = mcpServerConfigSchema.safeParse(candidate);
    return result.success ? result.data : null;
}

function parseServerArray(arr: unknown[]): McpServerConfig[] | null {
    const servers: McpServerConfig[] = [];
    for (let i = 0; i < arr.length; i += 1) {
        const server = coerceServerEntry(arr[i], `mcp-server-${i + 1}`);
        if (!server) return null;
        servers.push(server);
    }
    return servers;
}

function parseServerMap(
    map: JsonObject,
    allowEmpty = false
): McpServerConfig[] | null {
    const entries = Object.entries(map);
    if (entries.length === 0) return allowEmpty ? [] : null;

    const servers: McpServerConfig[] = [];
    for (const [key, value] of entries) {
        const server = coerceServerEntry(value, key);
        if (!server) return null;
        // 映射 key 作为 name 回填，便于 UI 展示
        servers.push(server.name ? server : { ...server, name: key });
    }
    return servers;
}

/**
 * 对已经 JSON 化后的值做形态识别。
 */
function parseMcpConfigValue(value: unknown): McpServerConfig[] | null {
    // ① 标准 MCP 配置：{ "$schema": "...", "mcpServers": ... }
    if (isObject(value) && 'mcpServers' in value) {
        const servers = value.mcpServers;
        if (Array.isArray(servers)) return parseServerArray(servers);
        if (isObject(servers)) return parseServerMap(servers, true);
        return null;
    }

    // ② 顶层数组：[{...}, {...}]
    if (Array.isArray(value)) return parseServerArray(value);

    if (!isObject(value)) return null;

    // ③ 单个服务器条目：{ type: "streamable-http", ... }
    const single = coerceServerEntry(value, 'mcp-server');
    if (single) return [single];

    // ④ 直接映射：{ "remote-service": { ... } }
    return parseServerMap(value, false);
}

/**
 * 安全解析：解析失败或不是 MCP 配置时返回 null。
 *
 * 输入允许 JSONC 注释（由 parseJsonc 处理）；
 * 但不支持尾随逗号（JSONC 规范也不允许）。
 */
export function parseMcpConfig(input: string): McpServerConfig[] | null {
    const parsed = safeParseJsonc(input);
    if (!parsed.success) return null;
    return parseMcpConfigValue(parsed.data);
}

/**
 * 严格解析：解析失败或不是 MCP 配置时抛出 SyntaxError / Error。
 */
export function parseMcpConfigOrThrow(input: string): McpServerConfig[] {
    const raw = parseJsonc(input);
    const servers = parseMcpConfigValue(raw);
    if (!servers) {
        throw new Error('Invalid MCP config');
    }
    return servers;
}