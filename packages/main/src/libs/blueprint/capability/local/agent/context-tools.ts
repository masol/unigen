// packages/main/src/libs/blueprint/capability/local/agent/context-tools.ts

import { LanceDB } from "$libs/project/controllers/lance/index.js";
import type { ProjectSearchDB } from "$libs/project/controllers/lance/project-search-db.js";
import { getGlobalRerankService } from "$libs/searchsrv/global-rerank-service.js";
import type { KbCatalogRow } from "$libs/searchsrv/tables/kb-catalog-table.js";
import type { KbChunkRow } from "$libs/searchsrv/tables/kb-table.js";
import type { SkillRow } from "$libs/searchsrv/tables/skill-table.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import pMap from "p-map";
import { z } from "zod";
import type { CompiledPacAgent } from "../type.js";

export const LOAD_LOCAL_SKILL_TOOL_NAME = "load_locskill";
export const QUERY_LOCAL_KB_TOOL_NAME = "query_lockc";

const KB_CANDIDATE_MULTIPLIER = 3;
const KB_SEARCH_CONCURRENCY = 4;
const KB_DEFAULT_LIMIT = 5;
const KB_MAX_LIMIT = 20;

const KB_SELECT_COLUMNS = [
    "id",
    "text",
    "title",
    "source",
    "metadata",
    "created_at",
    "updated_at",
];

interface LocalKbHit extends KbChunkRow {
    kbId: string;
    kbName: string;
    kbDescription: string;
    rerankScore?: number;
}

function readStringList(
    raw: unknown,
    field: string,
    source: string,
): string[] {
    if (raw === undefined) return [];

    if (!Array.isArray(raw)) {
        Logger.warn(`[PAC] ${source}: front matter.${field} 必须是字符串数组，已忽略`);
        return [];
    }

    const out: string[] = [];
    for (const value of raw) {
        if (typeof value !== "string") {
            Logger.warn(
                `[PAC] ${source}: front matter.${field} 包含非字符串项，已忽略该项`,
                value,
            );
            continue;
        }
        const trimmed = value.trim();
        if (trimmed) out.push(trimmed);
    }

    return [...new Set(out)];
}

function normalizeSkillId(name: string): string {
    return name.startsWith("skill:") ? name : `skill:${name}`;
}

function escapeTableCell(value: string): string {
    return value
        .replace(/`/g, "\\`")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ");
}

async function getProjectSearchDB(
    ctx: IRunnerContext,
): Promise<ProjectSearchDB | null> {
    try {
        const lance = LanceDB.ensure(ctx.prj);
        if (!lance.opened) {
            await lance.open();
        }
        if (!lance.opened) {
            return null;
        }
        return lance.search;
    } catch (error) {
        Logger.warn("[PAC] 获取项目 LanceDB 失败，跳过本地技能/知识库工具注入:", error);
        return null;
    }
}

export async function attachLocalContextTools(
    tools: Record<string, Tool>,
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
): Promise<void> {
    const skillNames = readStringList(
        compiled.config.skills,
        "skills",
        compiled.sourcePath,
    );
    const kbIds = readStringList(
        compiled.config.knowledgeBases,
        "knowledgeBases",
        compiled.sourcePath,
    );

    if (skillNames.length === 0 && kbIds.length === 0) return;

    const search = await getProjectSearchDB(ctx);
    if (!search) {
        Logger.warn(
            `[PAC] ${compiled.name}: 项目 LanceDB 不可用，跳过 skills/knowledgeBases 工具注入`,
        );
        return;
    }

    if (skillNames.length > 0) {
        await attachSkillTool(tools, compiled, search, skillNames);
    }

    if (kbIds.length > 0) {
        await attachKbTool(tools, compiled, search, kbIds);
    }
}

async function attachSkillTool(
    tools: Record<string, Tool>,
    compiled: CompiledPacAgent,
    search: ProjectSearchDB,
    skillNames: string[],
): Promise<void> {
    if (tools[LOAD_LOCAL_SKILL_TOOL_NAME]) {
        Logger.error(
            `[PAC] ${compiled.name}: 已存在工具 ${LOAD_LOCAL_SKILL_TOOL_NAME}，跳过本地技能工具注入`,
        );
        return;
    }

    const ids = [...new Set(skillNames.map(normalizeSkillId))];
    const byId = new Map<string, SkillRow>();

    for (const id of ids) {
        try {
            const row = await search.skill.getById(id);
            if (!row) {
                Logger.warn(`[PAC] ${compiled.name}: 本地技能不存在，已忽略: ${id}`);
                continue;
            }
            byId.set(row.id, row);
        } catch (error) {
            Logger.warn(`[PAC] ${compiled.name}: 读取本地技能失败，已忽略: ${id}`, error);
        }
    }

    const skills = [...byId.values()];
    if (skills.length === 0) return;

    const skillIds = skills.map((skill) => skill.id);
    const idSchema = z.enum(skillIds as [string, ...string[]]);

    tools[LOAD_LOCAL_SKILL_TOOL_NAME] = tool({
        description: buildSkillToolDescription(skills),
        inputSchema: z.object({
            id: idSchema.describe("要加载的本地技能 id，必须使用描述中列出的完整 id"),
        }),
        execute: async (input) => {
            const id = (input as { id: string }).id;
            const row = byId.get(id) ?? (await search.skill.getById(id));
            if (!row) {
                throw new Error(`本地技能不存在: ${id}`);
            }

            return [
                `# ${row.name}`,
                "",
                row.description,
                "",
                row.text,
            ].join("\n");
        },
    });

    Logger.debug(
        `[PAC] ${compiled.name}: 已注入本地技能工具 ${LOAD_LOCAL_SKILL_TOOL_NAME}，技能数=${skills.length}`,
    );
}

function buildSkillToolDescription(skills: SkillRow[]): string {
    const rows = skills
        .map((skill) => {
            const name = escapeTableCell(skill.name);
            const description = escapeTableCell(skill.description);
            return `| \`${skill.id}\` | ${name} | ${description} |`;
        })
        .join("\n");

    return [
        "加载本 agent 可用的本地技能正文。",
        "",
        `本次可用技能 ${skills.length} 个：`,
        "",
        "| 技能 id | 名称 | 描述 |",
        "| --- | --- | --- |",
        rows,
        "",
        "调用规则：",
        "- 当任务需要该技能的具体步骤、约束、示例或完整说明时调用本工具。",
        "- 参数 id 必须使用上表中的完整技能 id，不要自行拼接或猜测。",
        "- 一次只加载当前需要的技能，避免一次性加载全部正文。",
        "- 返回内容是技能 Markdown 正文，直接阅读理解后继续执行任务。",
    ].join("\n");
}

async function attachKbTool(
    tools: Record<string, Tool>,
    compiled: CompiledPacAgent,
    search: ProjectSearchDB,
    kbIds: string[],
): Promise<void> {
    if (tools[QUERY_LOCAL_KB_TOOL_NAME]) {
        Logger.error(
            `[PAC] ${compiled.name}: 已存在工具 ${QUERY_LOCAL_KB_TOOL_NAME}，跳过本地知识库工具注入`,
        );
        return;
    }

    const entries: KbCatalogRow[] = [];
    const seen = new Set<string>();

    for (const id of kbIds) {
        if (seen.has(id)) continue;
        seen.add(id);

        try {
            const entry = await search.kb.getCatalogEntry(id);
            if (!entry) {
                Logger.warn(`[PAC] ${compiled.name}: 本地知识库不存在，已忽略: ${id}`);
                continue;
            }
            entries.push(entry);
        } catch (error) {
            Logger.warn(`[PAC] ${compiled.name}: 读取本地知识库目录失败，已忽略: ${id}`, error);
        }
    }

    if (entries.length === 0) return;

    tools[QUERY_LOCAL_KB_TOOL_NAME] = tool({
        description: buildKbToolDescription(entries),
        inputSchema: z.object({
            query: z.string().min(1).describe("自然语言查询"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(KB_MAX_LIMIT)
                .optional()
                .describe(`返回条数，默认 ${KB_DEFAULT_LIMIT}，最大 ${KB_MAX_LIMIT}`),
        }),
        execute: async (input) => {
            const { query, limit: rawLimit } = input as {
                query: string;
                limit?: number;
            };
            const limit = Math.min(
                KB_MAX_LIMIT,
                Math.max(1, Math.floor(rawLimit ?? KB_DEFAULT_LIMIT)),
            );
            const candidateLimit = limit * KB_CANDIDATE_MULTIPLIER;

            const groups = await pMap(
                entries,
                async (entry): Promise<LocalKbHit[]> => {
                    try {
                        const table = await search.kb.ensure(entry.id);
                        const rows = await table.searchChunks(query, {
                            disableRerank: true,
                            limit: candidateLimit,
                            select: KB_SELECT_COLUMNS,
                        });

                        return rows.map((row) => ({
                            ...row,
                            kbId: entry.id,
                            kbName: entry.name,
                            kbDescription: entry.description,
                        }));
                    } catch (error) {
                        Logger.warn(
                            `[PAC] ${compiled.name}: 查询知识库失败，已跳过: ${entry.id}`,
                            error,
                        );
                        return [];
                    }
                },
                { concurrency: KB_SEARCH_CONCURRENCY },
            );

            const all = groups.flat();
            if (all.length === 0) {
                return JSON.stringify([], null, 2);
            }

            const rerank = getGlobalRerankService();
            const rerankEnabled = await rerank.isEnabled();

            if (rerankEnabled) {
                try {
                    const documents = all.map((row) => String(row.text ?? ""));
                    if (documents.every((text) => text.length > 0)) {
                        const result = await rerank.rerank(query, documents, {
                            topN: limit,
                        });

                        const ranked = result.ranking
                            .map((item): LocalKbHit | null => {
                                const row = all[item.originalIndex];
                                if (!row) return null;

                                const score = readRerankScore(item);
                                return score === undefined
                                    ? row
                                    : { ...row, rerankScore: score };
                            })
                            .filter((row): row is LocalKbHit => row !== null);

                        if (ranked.length > 0) {
                            return JSON.stringify(ranked.slice(0, limit), null, 2);
                        }
                    }
                } catch (error) {
                    Logger.warn(
                        `[PAC] ${compiled.name}: 知识库查询结果 Rerank 失败，使用未重排结果。`,
                        error,
                    );
                }
            }

            return JSON.stringify(all.slice(0, limit), null, 2);
        },
    });

    Logger.debug(
        `[PAC] ${compiled.name}: 已注入本地知识库工具 ${QUERY_LOCAL_KB_TOOL_NAME}，知识库数=${entries.length}`,
    );
}

function buildKbToolDescription(entries: KbCatalogRow[]): string {
    const rows = entries
        .map((entry) => {
            const name = escapeTableCell(entry.name);
            const description = escapeTableCell(entry.description);
            return `| \`${entry.id}\` | ${name} | ${description} |`;
        })
        .join("\n");

    return [
        "检索本 agent 可用的本地知识库。",
        "",
        `本次可用知识库 ${entries.length} 个：`,
        "",
        "| 知识库 id | 名称 | 描述 |",
        "| --- | --- | --- |",
        rows,
        "",
        "调用参数：",
        "- `query`：自然语言查询，必填。",
        `- \`limit\`：返回条数，可选，默认 ${KB_DEFAULT_LIMIT}，最大 ${KB_MAX_LIMIT}。`,
        "",
        "行为说明：",
        "- 多个知识库会并行检索，并禁用各库内部 Rerank。",
        "- 合并候选后，如果全局 Rerank 可用，会统一精排并返回 topN。",
        "- 返回 JSON 数组，每项通常包含 kbId、kbName、kbDescription、id、text、title、source、metadata、rerankScore 等字段。",
        "- 请根据知识库描述选择相关库；不要查询明显无关的知识库。",
    ].join("\n");
}

function readRerankScore(value: unknown): number | undefined {
    if (!value || typeof value !== "object") return undefined;

    const record = value as Record<string, unknown>;
    for (const key of [
        "score",
        "rerankScore",
        "relevanceScore",
        "relevance_score",
    ]) {
        const raw = record[key];
        if (typeof raw === "number" && Number.isFinite(raw)) {
            return raw;
        }
    }

    return undefined;
}