import type { McpServerConfig, McpTransport } from '@app/main/types';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const out = value.filter((item): item is string => typeof item === 'string');
    return out.length > 0 ? out : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined;

    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string') out[key] = item;
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeTransport(raw: JsonRecord): McpTransport | null {
    const transportRaw = isRecord(raw.transport) ? raw.transport : raw;

    const type =
        asString(transportRaw.type) ??
        (asString(transportRaw.command)
            ? 'stdio'
            : asString(transportRaw.url)
                ? 'http'
                : undefined);

    if (type === 'stdio') {
        const command = asString(transportRaw.command);
        if (!command) return null;

        return {
            type: 'stdio',
            command,
            args: stringArray(transportRaw.args),
            env: stringRecord(transportRaw.env),
            cwd: asString(transportRaw.cwd),
        };
    }

    if (type === 'sse' || type === 'http') {
        const url = asString(transportRaw.url);
        if (!url) return null;

        return {
            type,
            url,
            headers: stringRecord(transportRaw.headers),
        };
    }

    return null;
}

function normalizeServer(id: string, raw: unknown): McpServerConfig | null {
    if (!isRecord(raw)) return null;

    const transport = normalizeTransport(raw);
    if (!transport) return null;

    return {
        id,
        name: asString(raw.name) ?? id,
        enabled: asBoolean(raw.enabled) ?? true,
        transport,
    };
}

/**
 * 解析 SEP-2633 提案风格配置。
 *
 * 当前兼容以下常见形态：
 * 1. { mcpServers: { [id]: server } }
 * 2. { servers: { [id]: server } }
 * 3. 单个 server 对象，包含 id / name / transport / command / url
 *
 * 返回值为标准 McpServerConfig[]，可直接交给 configStore.setMcpServer 持久化。
 */
export function parseMcpConfigJson(raw: unknown): McpServerConfig[] {
    if (!isRecord(raw)) return [];

    const maps = [raw.mcpServers, raw.servers].filter(isRecord);

    if (maps.length > 0) {
        const out: McpServerConfig[] = [];

        for (const map of maps) {
            for (const [id, value] of Object.entries(map)) {
                const server = normalizeServer(id, value);
                if (server) out.push(server);
            }
        }

        if (out.length > 0) return out;
    }

    if (typeof raw.id === 'string') {
        const server = normalizeServer(raw.id, raw);
        if (server) return [server];
    }

    if (
        isRecord(raw.transport) ||
        typeof raw.command === 'string' ||
        typeof raw.url === 'string'
    ) {
        const id =
            asString(raw.id) ??
            asString(raw.name) ??
            'imported-server';

        const server = normalizeServer(id, raw);
        if (server) return [server];
    }

    return [];
}

/**
 * 从 ZIP 提取并返回 SEP-2633 格式配置 JSON。
 *
 * TODO: 由你后续实现。
 * 当前返回 null，调用侧会提示“ZIP 配置解析尚未实现”。
 */
export async function importMcpConfigFromZip(
    file: File,
): Promise<unknown | null> {
    void file;
    return null;
}