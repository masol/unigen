import { parseMcpConfigOrThrow } from '$libs/blueprint/loader/mcp/parse.js';
import { openGlobalSearch } from "$libs/searchsrv/index.js";
import { globalToolDB, type ToolMeta } from "$libs/tooldb/index.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { WindowService } from '$libs/utils/window.js';
import {
    toolSearchInputSchema,
    toolSearchOutputSchema,
    type ToolSearchItem,
} from "$types/shared/api/agent.js";
import { mcpServerConfigSchema } from '$types/shared/mcp.js';
import { os } from "@orpc/server";
import AdmZip from 'adm-zip';
import { app, dialog } from 'electron';
import Logger from "electron-log/main.js";
import { ensureDir } from 'fs-extra';
import { readFile, writeFile } from 'fs/promises';
import { dirname, join, posix } from 'path';
import { z } from 'zod';
import type { RpcContext } from '../type.js';

/**
 * ToolMeta -> API DTO。
 *
 * 只返回展示所需字段，避免把 schema、内部元数据等大字段跨进程传输。
 */
function toToolSearchItem(meta: ToolMeta): ToolSearchItem {
    const metadata: Record<string, unknown> = {
        source: meta.source,
    };

    if (meta.serverId) {
        metadata.serverId = meta.serverId;
    }

    const rerankScore =
        typeof meta.rerankScore === "number" &&
            Number.isFinite(meta.rerankScore)
            ? meta.rerankScore
            : undefined;

    return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        metadata,
        ...(rerankScore !== undefined ? { rerankScore } : {}),
    };
}

const searchTools = os
    .input(toolSearchInputSchema)
    .output(toolSearchOutputSchema)
    .handler(async ({ input }) => {
        const db = await openGlobalSearch();
        if (!db.opened) {
            throwPrecondition("[Agent] 全局检索库未就绪，无法检索工具。");
        }

        // 多取 1 条判断是否还有下一页，避免额外 count 查询。
        const fetchLimit = input.limit + 1;

        const metas = await globalToolDB.searchTools(input.query, {
            limit: fetchLimit,
            offset: input.offset,
        });

        const hasMore = metas.length > input.limit;
        const items = metas
            .slice(0, input.limit)
            .map((meta) => toToolSearchItem(meta));

        Logger.debug(
            `[Agent] 工具检索完成: query=${JSON.stringify(
                input.query,
            )}, offset=${input.offset}, items=${items.length}, hasMore=${hasMore}`,
        );

        return {
            items,
            hasMore,
        };
    });

const mcpImportResultSchema = z.union([
    z.object({
        canceled: z.literal(true),
    }),
    z.object({
        canceled: z.literal(false),
        servers: z.array(mcpServerConfigSchema),
        sourcePath: z.string(),
    }),
]);

const mcpExportResultSchema = z.object({
    success: z.boolean(),
    canceled: z.boolean().optional(),
    filePath: z.string().optional(),
});

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
 * 导入 MCP 配置。
 *
 * - 由主进程打开文件选择对话框，拿到完整路径；
 * - 支持 JSON 与 ZIP；
 * - ZIP 中必须存在 mcp.json，mcp.json 所在目录视为资源根目录；
 * - ZIP 导入时，将资源复制到 app.getPath('userData')/mcp/<server.id>。
 */
const importMcpConfig = os
    .input(z.void())
    .output(mcpImportResultSchema)
    .handler(async ({ context }) => {
        const { canceled, filePaths } = await WindowService.instance.withModalWindow(
            context as RpcContext,
            (parent) =>
                dialog.showOpenDialog(parent, {
                    title: '导入 MCP 配置',
                    properties: ['openFile', 'dontAddToRecent'],
                    filters: [
                        {
                            name: 'MCP 配置',
                            extensions: ['json', 'zip'],
                        },
                        {
                            name: 'JSON',
                            extensions: ['json'],
                        },
                        {
                            name: 'ZIP',
                            extensions: ['zip'],
                        },
                    ],
                }),
        );

        if (canceled || filePaths.length === 0) {
            return { canceled: true as const };
        }

        const sourcePath = filePaths[0];

        if (!sourcePath.toLowerCase().endsWith('.zip')) {
            const text = await readFile(sourcePath, 'utf8');
            const servers = parseMcpConfigOrThrow(text);

            return {
                canceled: false as const,
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
        const mcpRoot = join(app.getPath('userData'), 'mcp');

        for (const server of servers) {
            const targetRoot = join(mcpRoot, safeMcpDirectoryName(server.id));
            await ensureDir(targetRoot);
            await copyZipResources(zip, configEntry.entryName, targetRoot);
        }

        return {
            canceled: false as const,
            servers,
            sourcePath,
        };
    });

/**
 * 导出单个 MCP 配置为 JSON。
 */
const exportMcpServerConfig = os
    .input(
        z.object({
            server: mcpServerConfigSchema,
        }),
    )
    .output(mcpExportResultSchema)
    .handler(async ({ input, context }) => {
        const { server } = input;
        const fallbackName = /^[a-zA-Z0-9._-]+$/.test(server.id)
            ? server.id
            : 'mcp-config';

        const { canceled, filePath } = await WindowService.instance.withModalWindow(
            context as RpcContext,
            (parent) =>
                dialog.showSaveDialog(parent, {
                    title: '导出 MCP 配置',
                    defaultPath: `${fallbackName}.json`,
                    filters: [
                        {
                            name: 'JSON',
                            extensions: ['json'],
                        },
                    ],
                    properties: ['showOverwriteConfirmation'],
                }),
        );

        if (canceled || !filePath) {
            return { success: false, canceled: true };
        }

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

        return {
            success: true,
            canceled: false,
            filePath: targetPath,
        };
    });

export default {
    searchTools,
    importMcpConfig,
    exportMcpServerConfig,
};