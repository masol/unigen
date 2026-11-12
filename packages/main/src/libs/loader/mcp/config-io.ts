import { McpDirName } from '$libs/const.js';
import type { McpServerConfig } from '$types/shared/mcp.js';
import AdmZip from 'adm-zip';
import { app } from 'electron';
import Logger from 'electron-log/main.js';
import { ensureDir } from 'fs-extra';
import { readFile, writeFile } from 'fs/promises';
import { dirname, join, posix } from 'path';
import { parseMcpConfigOrThrow } from './parse.js';

export interface ImportedMcpConfig {
    servers: McpServerConfig[];
    sourcePath: string;
}

/**
 * 将 zip 内路径归一化为安全相对路径。
 *
 * zip 条目统一按 POSIX 风格处理；同时拒绝 Windows 反斜杠逃逸与 ../ 逃逸。
 */
function safeZipRelativeName(name: string): string | null {
    const normalized = posix
        .normalize(name.replace(/\\/g, '/'))
        .replace(/^\/+/, '');

    if (!normalized || normalized === '.' || normalized === '..') {
        return null;
    }

    if (normalized.startsWith('../') || normalized.includes('/../')) {
        return null;
    }

    return normalized;
}

/**
 * MCP 服务 id 会作为 userData/mcp 下的目录名使用，必须限制为安全目录名。
 */
function safeMcpDirectoryName(id: string): string {
    const name = id.trim();

    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
        throw new Error(`MCP 服务 ID 不能用作目录名: ${id}`);
    }

    return name;
}

/**
 * 将 zip 中 mcp.json 所在目录及其资源复制到 targetRoot。
 */
async function copyZipResources(
    zip: AdmZip,
    configEntryName: string,
    targetRoot: string,
): Promise<void> {
    const idx = configEntryName.lastIndexOf('/');
    const configDir = idx >= 0 ? configEntryName.slice(0, idx + 1) : '';

    for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        if (!entry.entryName.startsWith(configDir)) continue;

        const relative = entry.entryName.slice(configDir.length);
        const safeRelative = safeZipRelativeName(relative);
        if (!safeRelative) continue;

        const dest = join(targetRoot, safeRelative);
        await ensureDir(dirname(dest));
        await writeFile(dest, entry.getData());
    }
}

/**
 * 从本地路径导入 MCP 配置。
 *
 * - JSON：直接解析并返回 servers；
 * - ZIP：必须存在 mcp.json，mcp.json 所在目录视为资源根目录；
 *   将资源复制到 app.getPath('userData')/mcp/<server.id>。
 */
export async function importMcpConfigFromPath(
    sourcePath: string,
): Promise<ImportedMcpConfig> {
    if (!sourcePath.toLowerCase().endsWith('.zip')) {
        const text = await readFile(sourcePath, 'utf8');
        const servers = parseMcpConfigOrThrow(text);

        return {
            servers,
            sourcePath,
        };
    }

    const zip = new AdmZip(sourcePath);
    const configEntries = zip
        .getEntries()
        .filter(
            (entry) =>
                !entry.isDirectory &&
                posix.basename(entry.entryName).toLowerCase() === 'mcp.json',
        )
        .sort(
            (a, b) =>
                a.entryName.split('/').length -
                b.entryName.split('/').length,
        );

    if (configEntries.length === 0) {
        throw new Error('ZIP 中未找到 mcp.json 配置文件');
    }

    if (configEntries.length > 1) {
        Logger.warn(
            `[Agent] ZIP 中存在多个 mcp.json，将使用层级最浅的一个: ${configEntries[0].entryName}`,
        );
    }

    const configEntry = configEntries[0];
    const servers = parseMcpConfigOrThrow(zip.readAsText(configEntry));
    const mcpRoot = join(app.getPath('userData'), McpDirName);

    for (const server of servers) {
        const targetRoot = join(mcpRoot, safeMcpDirectoryName(server.id));
        await ensureDir(targetRoot);
        await copyZipResources(zip, configEntry.entryName, targetRoot);
    }

    return {
        servers,
        sourcePath,
    };
}

/**
 * 导出 MCP 配置时的默认文件名主体。
 */
export function getMcpExportDefaultBaseName(
    server: McpServerConfig,
): string {
    return /^[a-zA-Z0-9._-]+$/.test(server.id)
        ? server.id
        : 'mcp-config';
}

/**
 * 将单个 MCP 配置写入指定路径。
 *
 * 调用方传入的路径无 .json 后缀时自动补齐，返回最终写入路径。
 */
export async function exportMcpServerConfigToPath(
    server: McpServerConfig,
    filePath: string,
): Promise<string> {
    const targetPath = filePath.toLowerCase().endsWith('.json')
        ? filePath
        : `${filePath}.json`;

    const payload = {
        mcpServers: {
            [server.id]: {
                name: server.name,
                enabled: server.enabled,
                transport: server.transport,
            },
        },
    };

    await writeFile(
        targetPath,
        JSON.stringify(payload, null, 2),
        'utf8',
    );

    return targetPath;
}