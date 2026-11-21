// packages/main/src/libs/loader/mcp/config-io.ts
import { globalMCPDir } from "$libs/utils/sys/dir.js";
import type { McpServerConfig } from "$types/shared/mcp.js";
import Logger from "electron-log/main.js";
import { ensureDir } from "fs-extra";
import { readFile, writeFile } from "fs/promises";
import { join, posix } from "path";
import {
    extractArchive,
    listArchiveEntries,
    safeArchiveRelativeName,
} from "../archive.js";
import { parseMcpConfigOrThrow } from "./parse.js";

export interface ImportedMcpConfig {
    servers: McpServerConfig[];
    sourcePath: string;
}

function stripBom(value: string): string {
    return value.length > 0 && value.charCodeAt(0) === 0xfeff
        ? value.slice(1)
        : value;
}

function archiveDirName(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(0, idx + 1) : "";
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

function isArchivePath(filePath: string): boolean {
    return /\.(?:zip|tar|tar\.gz|tgz|tar\.bz2|bz2)$/i.test(filePath);
}

/**
 * 从本地路径导入 MCP 配置。
 *
 * - JSON/JSONC：直接解析并返回 servers；
 * - 归档：必须存在 mcp.json，mcp.json 所在目录视为资源根目录；
 *   将资源解压到 globalMCPDir()/<server.id>。
 */
export async function importMcpConfigFromPath(
    sourcePath: string,
): Promise<ImportedMcpConfig> {
    if (!isArchivePath(sourcePath)) {
        const text = await readFile(sourcePath, "utf8");
        const servers = parseMcpConfigOrThrow(stripBom(text));

        return {
            servers,
            sourcePath,
        };
    }

    const entries = await listArchiveEntries(sourcePath);
    const configEntries = entries
        .filter(
            (entry) =>
                !entry.isDirectory &&
                posix.basename(entry.path).toLowerCase() === "mcp.json",
        )
        .sort(
            (a, b) =>
                a.path.split("/").length - b.path.split("/").length,
        );

    if (configEntries.length === 0) {
        throw new Error("归档中未找到 mcp.json 配置文件");
    }

    if (configEntries.length > 1) {
        Logger.warn(
            `[Agent] 归档中存在多个 mcp.json，将使用层级最浅的一个: ${configEntries[0].path}`,
        );
    }

    const configEntry = configEntries[0];
    const configPath = safeArchiveRelativeName(configEntry.path);
    if (!configPath) {
        throw new Error("mcp.json 路径非法");
    }

    const servers = parseMcpConfigOrThrow(
        stripBom((await configEntry.read()).toString("utf8")),
    );
    const configDir = archiveDirName(configPath);
    const mcpRoot = globalMCPDir();

    for (const server of servers) {
        const targetRoot = join(mcpRoot, safeMcpDirectoryName(server.id));
        await ensureDir(targetRoot);

        await extractArchive({
            archivePath: sourcePath,
            targetDir: targetRoot,
            stripPrefix: configDir,
        });
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
        : "mcp-config";
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
    const targetPath = filePath.toLowerCase().endsWith(".json")
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
        "utf8",
    );

    return targetPath;
}