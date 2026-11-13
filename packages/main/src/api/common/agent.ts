// packages/main/src/api/common/agent.ts
// packages/main/src/api/common/agent.ts
import { installKnowledgeBase as installKnowledgeBaseFromSource } from "$libs/loader/kb/install.js";
import {
    deleteKnowledgeBase as deleteKnowledgeBaseFromLoader,
    listKnowledgeBases as listKnowledgeBasesFromLoader,
    upsertKnowledgeBase as upsertKnowledgeBaseFromLoader,
} from "$libs/loader/kb/service.js";
import {
    exportMcpServerConfigToPath,
    getMcpExportDefaultBaseName,
    importMcpConfigFromPath,
} from '$libs/loader/mcp/config-io.js';
import { installSkill as installSkillFromSource } from "$libs/loader/skill/install.js";
import { uninstallSkill as uninstallSkillFromSource } from "$libs/loader/skill/uninstall.js";
import {
    openGlobalSearch,
    type SkillRow,
} from "$libs/searchsrv/index.js";
import { globalToolDB, type ToolMeta } from "$libs/tooldb/index.js";
import {
    queryAllKnowledge,
    type ChunkOutput,
} from "$libs/tooldb/tools/meta-tools/rag.js";
import { throwPrecondition } from "$libs/utils/err.js";
import { WindowService } from '$libs/utils/window.js';
import {
    toolSearchInputSchema,
    toolSearchOutputSchema,
    type ToolSearchItem,
} from "$types/shared/api/agent.js";
import {
    knowledgeBaseDeleteInputSchema,
    knowledgeBaseDeleteOutputSchema,
    knowledgeBaseInstallInputSchema,
    knowledgeBaseInstallOutputSchema,
    knowledgeBaseListOutputSchema,
    knowledgeBaseSearchInputSchema,
    knowledgeBaseSearchOutputSchema,
    knowledgeBaseUpsertInputSchema,
    knowledgeBaseUpsertOutputSchema,
    type KnowledgeBaseSearchItem,
} from "$types/shared/api/kb.js";
import {
    skillDeleteInputSchema,
    skillDeleteOutputSchema,
    skillInstallInputSchema,
    skillInstallOutputSchema,
    skillSearchInputSchema,
    skillSearchOutputSchema,
    type SkillSearchItem,
} from "$types/shared/api/skill.js";
import { mcpServerConfigSchema } from '$types/shared/mcp.js';
import { os } from "@orpc/server";
import { dialog } from 'electron';
import Logger from "electron-log/main.js";
import { z } from "zod";
import type { RpcContext } from '../type.js';

function parseMetadata(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string" && raw) {
        try {
            const parsed = JSON.parse(raw) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
        } catch {
            return {};
        }
    }

    return raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
}

function readRerankScore(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

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

    const rerankScore = readRerankScore(meta.rerankScore);

    return {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        metadata,
        ...(rerankScore !== undefined ? { rerankScore } : {}),
    };
}

/**
 * SkillRow -> API DTO。
 *
 * skill 正文不跨进程传输；只返回检索/展示所需字段。
 */
function toSkillSearchItem(row: SkillRow): SkillSearchItem {
    const rerankScore = readRerankScore(row.rerankScore);

    return {
        id: row.id,
        name: row.name,
        description: row.description,
        path: row.path,
        metadata: parseMetadata(row.metadata),
        ...(rerankScore !== undefined ? { rerankScore } : {}),
    };
}

/**
 * ChunkOutput -> API DTO。
 *
 * ChunkOutput 的 kbName 是可选的，用 catalog 兜底；
 * kbDescription 不在 ChunkOutput 中，从 catalog 映射补全。
 *
 * 注：当前 ChunkOutput 不携带 rerankScore，故该字段不会出现。
 * 如需在卡片上展示相关度分数，需先让 toChunkOutput 透传 score。
 */
function toKnowledgeBaseSearchItem(
    row: ChunkOutput,
    catalogById: Map<string, { name: string; description: string }>,
): KnowledgeBaseSearchItem {
    const entry = catalogById.get(row.kbId);
    Logger.debug("search metadata=", row.metadata)
    return {
        id: row.chunkId,
        kbId: row.kbId,
        kbName: row.kbName || entry?.name || row.kbId,
        kbDescription: entry?.description ?? "",
        text: row.text,
        title: row.title,
        source: row.source,
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

const searchSkills = os
    .input(skillSearchInputSchema)
    .output(skillSearchOutputSchema)
    .handler(async ({ input }) => {
        const db = await openGlobalSearch();
        if (!db.opened) {
            throwPrecondition("[Agent] 全局检索库未就绪，无法检索 Skill。");
        }

        // 多取 1 条判断是否还有下一页，避免额外 count 查询。
        const fetchLimit = input.limit + 1;

        const rows = await db.skill.searchSkills(input.query, {
            limit: fetchLimit,
            offset: input.offset,
        });

        const hasMore = rows.length > input.limit;
        const items = rows
            .slice(0, input.limit)
            .map((row) => toSkillSearchItem(row));

        Logger.debug(
            `[Agent] Skill 检索完成: query=${JSON.stringify(
                input.query,
            )}, offset=${input.offset}, items=${items.length}, hasMore=${hasMore}`,
        );

        return {
            items,
            hasMore,
        };
    });

const searchKnowledgeBases = os
    .input(knowledgeBaseSearchInputSchema)
    .output(knowledgeBaseSearchOutputSchema)
    .handler(async ({ input }) => {
        const db = await openGlobalSearch();
        if (!db.opened) {
            throwPrecondition(
                "[Agent] 全局检索库未就绪，无法检索知识库片段。",
            );
        }

        const query = input.query.trim();
        if (!query) {
            return {
                items: [],
                hasMore: false,
            };
        }

        // 用 catalog 给 ChunkOutput 补齐 kbName / kbDescription：
        // ChunkOutput 的 kbName 可选，kbDescription 完全缺失。
        const catalog = await db.kb.listCatalogEntries();
        const catalogById = new Map(
            catalog.map(
                (entry) =>
                    [
                        entry.id,
                        { name: entry.name, description: entry.description },
                    ] as const,
            ),
        );

        // 多取 1 条判断 hasMore；offset 透传给 queryAllKnowledge，
        // 由其内部按 (offset + limit) 扩大每库候选并跨库统一 rerank。
        const rows = await queryAllKnowledge(
            query,
            input.limit + 1,
            input.offset,
        );

        const hasMore = rows.length > input.limit;
        const items = rows
            .slice(0, input.limit)
            .map((row) => toKnowledgeBaseSearchItem(row, catalogById));

        Logger.debug(
            `[Agent] 知识库片段检索完成: query=${JSON.stringify(
                query,
            )}, offset=${input.offset}, items=${items.length}, hasMore=${hasMore}`,
        );

        return {
            items,
            hasMore,
        };
    });

const listKnowledgeBases = os
    .input(z.void())
    .output(knowledgeBaseListOutputSchema)
    .handler(async () => {
        return listKnowledgeBasesFromLoader();
    });

const upsertKnowledgeBase = os
    .input(knowledgeBaseUpsertInputSchema)
    .output(knowledgeBaseUpsertOutputSchema)
    .handler(async ({ input }) => {
        return upsertKnowledgeBaseFromLoader(input);
    });

const deleteKnowledgeBase = os
    .input(knowledgeBaseDeleteInputSchema)
    .output(knowledgeBaseDeleteOutputSchema)
    .handler(async ({ input }) => {
        await deleteKnowledgeBaseFromLoader(input.id);
        return { success: true as const };
    });

/**
 * 安装技能。
 *
 * 主进程负责弹出 zip 选择框并完成解压安装，安装完成后直接返回；
 * 不查询检索库，列表刷新由渲染进程在安装成功后自行发起。
 */
const installSkill = os
    .input(skillInstallInputSchema)
    .output(skillInstallOutputSchema)
    .handler(async ({ context }) => {
        const { canceled, filePaths } =
            await WindowService.instance.withModalWindow(
                context as RpcContext,
                (parent) =>
                    dialog.showOpenDialog(parent, {
                        title: "安装技能",
                        properties: ["openFile", "dontAddToRecent"],
                        filters: [
                            {
                                name: "技能压缩包",
                                extensions: ["zip"],
                            },
                        ],
                    }),
            );

        if (canceled || filePaths.length === 0) {
            return { canceled: true as const };
        }

        const result = await installSkillFromSource(filePaths[0]);

        // loader 在目标技能已存在等场景下会返回 null；这里必须显式拦截，
        // 避免后续读取 result.source 抛 TypeError，并把可读错误返回给客户端。
        if (!result) {
            throwPrecondition("技能已存在，无需重复安装。");
        }

        Logger.debug(
            `[Agent] Skill 安装完成: source=${JSON.stringify(
                result.source,
            )}, targetDir=${JSON.stringify(result.targetDir)}`,
        );

        return {
            canceled: false as const,
            source: result.source,
            targetDir: result.targetDir,
        };
    });

const deleteSkill = os
    .input(skillDeleteInputSchema)
    .output(skillDeleteOutputSchema)
    .handler(async ({ input }) => {
        await uninstallSkillFromSource(input.id);
        return { success: true as const };
    });

const installKnowledgeBase = os
    .input(knowledgeBaseInstallInputSchema)
    .output(knowledgeBaseInstallOutputSchema)
    .handler(async ({ input }) => {
        return installKnowledgeBaseFromSource(input);
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
 * 导入 MCP 配置。
 *
 * API 层只负责弹出文件选择框并调用 loader；
 * JSON / ZIP 解析、ZIP 资源落盘、目录安全校验均在
 * $libs/loader/mcp/config-io.ts 中完成。
 */
const importMcpConfig = os
    .input(z.void())
    .output(mcpImportResultSchema)
    .handler(async ({ context }) => {
        const { canceled, filePaths } =
            await WindowService.instance.withModalWindow(
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

        const result = await importMcpConfigFromPath(filePaths[0]);

        return {
            canceled: false as const,
            ...result,
        };
    });

/**
 * 导出单个 MCP 配置为 JSON。
 *
 * API 层只负责弹出保存框并调用 loader；
 * 文件名兜底、.json 后缀补齐、JSON 序列化均在 loader 中完成。
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

        const { canceled, filePath } =
            await WindowService.instance.withModalWindow(
                context as RpcContext,
                (parent) =>
                    dialog.showSaveDialog(parent, {
                        title: '导出 MCP 配置',
                        defaultPath: `${getMcpExportDefaultBaseName(server)}.json`,
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

        const targetPath = await exportMcpServerConfigToPath(
            server,
            filePath,
        );

        return {
            success: true,
            canceled: false,
            filePath: targetPath,
        };
    });

export default {
    searchTools,
    searchSkills,
    searchKnowledgeBases,
    listKnowledgeBases,
    upsertKnowledgeBase,
    deleteKnowledgeBase,
    installSkill,
    deleteSkill,
    installKnowledgeBase,
    importMcpConfig,
    exportMcpServerConfig,
};