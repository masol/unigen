// packages/main/src/libs/tooldb/tools/meta-tools/rag.ts
import { LanceDB } from "$libs/project/controllers/lance/index.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { loadTextFileStrict } from "$libs/searchsrv/file-text-loader.js";
import type {
    KbCatalogRow,
    KbChunkRow,
    KbRegistry,
    KbTable,
    SkillRow,
} from "$libs/searchsrv/index.js";
import {
    getGlobalRerankService,
    getGlobalSearchDB,
} from "$libs/searchsrv/index.js";
import Logger from "electron-log/main.js";
import fs from "node:fs";
import path from "node:path";
import pMap from "p-map";
import { z } from "zod";
import { buildAiTool } from "../../builder.js";
import type { ToolDefinition } from "../../type.js";
import {
    loadSkillToolName,
    queryAllKnowledgeToolName,
    queryKnowledgeToolName,
    searchKnowledgeBasesToolName,
    searchSkillsToolName,
} from "./names.js";

const DEFAULT_LIMIT = 8;
const CANDIDATE_MULTIPLIER = 3;
const SEARCH_CONCURRENCY = 4;

// const NO_SKILL_HINT =
//     "没有找到匹配的 Skill。请换一种能力描述，或确认该能力是否已作为 Skill 提供；" +
//     "不要用同义关键词反复重试。";

// const NO_KB_HINT =
//     "没有找到匹配的知识库。请换一种知识主题描述；" +
//     "如果明确知道知识库 id，也可以直接调用 query_knowledge。";

// const NO_KB_CHUNK_HINT =
//     "没有检索到知识库片段。可能是知识库为空，或查询与内容不匹配。";

const NO_SKILL_HINT =
    "No matching skill found. Rephrase the capability description, or confirm " +
    "the capability is provided as a skill. Do not retry with synonyms.";

const NO_KB_HINT =
    `No matching knowledge base found for this topic. The knowledge base stores personal preferences, project constraints, historical decisions, and private facts — not general reference — so a general concept may not be covered here. Rephrase the topic, or if you already know the base id, call query_knowledge directly. To search across all bases without choosing one, use query_all_knowledge.`;

const NO_KB_CHUNK_HINT =
    "No knowledge chunks retrieved. The knowledge base may be empty, or the " +
    "query does not match its content.";

type Scope = "project" | "global";

interface ScopedSkill {
    scope: Scope;
    row: SkillRow;
}

interface ScopedKbCatalog {
    scope: Scope;
    row: KbCatalogRow;
}

interface ScopedChunk {
    scope: Scope;
    kbId: string;
    kbName: string;
    row: KbChunkRow;
}

export interface ChunkOutput {
    kbId: string;
    kbName?: string;
    chunkId: string;
    text: string;
    title: string;
    source: string;
    metadata?: unknown;
}

export interface LoadSkillResult {
    found: boolean;
    id?: string;
    name?: string;
    description?: string;
    path?: string;
    text?: string;
    metadata?: Record<string, unknown>;
    error?: string;
    hint?: string;
}

interface FoundKb {
    scope: Scope;
    entry: KbCatalogRow;
    table: KbTable;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
    if (typeof raw !== "string" || !raw) return {};

    try {
        const parsed = JSON.parse(raw) as unknown;
        return parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

async function getProjectLance(): Promise<LanceDB | null> {
    try {
        const ctx = getRunnerContext();
        const lance = LanceDB.ensure(ctx.prj);
        if (!lance.opened) {
            await lance.open();
        }
        return lance.opened ? lance : null;
    } catch (error) {
        Logger.warn(
            "[ToolDB] 获取项目级 LanceDB 失败，已跳过项目级检索。",
            error,
        );
        return null;
    }
}

function getOpenedGlobalSearch() {
    const db = getGlobalSearchDB();
    return db.opened ? db : null;
}

/**
 * 从 KbRegistry 取回可用表：命中缓存直接返回，未加载则懒加载。
 *
 * - 懒加载是启动期 restore() 之外的防御层：restore 内部对单库 ensure
 *   失败只 warn 跳过，这里再给检索入口一次自愈机会。
 * - ensure 命中内存缓存时零成本；仅在“未加载”时承担 init 开销，
 *   而这部分开销在 restore() 时本来也会发生。
 * - ensure 失败（磁盘损坏、表名冲突等）时 warn 并返回 null，
 *   由调用方决定跳过还是抛出，避免单库异常阻断整个枚举。
 */
async function resolveKbTable(
    registry: KbRegistry,
    id: string,
): Promise<KbTable | null> {
    const cached = registry.tryGet(id);
    if (cached) return cached;

    try {
        return await registry.ensure(id);
    } catch (error) {
        Logger.warn(
            `[ToolDB] 知识库 [${id}] 加载失败，已跳过。`,
            error,
        );
        return null;
    }
}

async function rerankCandidates<T>(
    query: string,
    items: T[],
    getText: (item: T) => string,
    limit: number,
): Promise<T[]> {
    const fallback = (): T[] => items.slice(0, limit);

    if (items.length === 0) return [];
    if (items.length === 1) return fallback();

    const service = getGlobalRerankService();

    let enabled = false;
    try {
        enabled = await service.isEnabled();
    } catch (error) {
        Logger.warn(
            "[ToolDB] Rerank 检查失败，本次使用未重排结果。",
            error,
        );
    }

    if (!enabled) return fallback();

    const documents = items.map((item) => getText(item));
    if (documents.some((text) => text.length === 0)) return fallback();

    try {
        const result = await service.rerank(query, documents, {
            topN: limit,
        });

        const ranked: T[] = [];
        for (const r of result.ranking) {
            const item = items[r.originalIndex];
            if (!item) continue;
            ranked.push(item);
            if (ranked.length >= limit) break;
        }

        return ranked.length > 0 ? ranked : fallback();
    } catch (error) {
        Logger.warn(
            "[ToolDB] Rerank 失败，本次使用未重排结果。",
            error,
        );
        return fallback();
    }
}

async function searchSkillsAcross(
    query: string,
    limit: number,
): Promise<ScopedSkill[]> {
    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);
    const project = await getProjectLance();
    const global = getOpenedGlobalSearch();

    const jobs: Array<() => Promise<ScopedSkill[]>> = [];

    if (project) {
        jobs.push(async () => {
            const rows = await project.search.skill.searchSkills(query, {
                limit: candidateLimit,
                disableRerank: true,
            });
            return rows.map((row) => ({ scope: "project" as const, row }));
        });
    }

    if (global) {
        jobs.push(async () => {
            const rows = await global.skill.searchSkills(query, {
                limit: candidateLimit,
                disableRerank: true,
            });
            return rows.map((row) => ({ scope: "global" as const, row }));
        });
    }

    if (jobs.length === 0) return [];

    const groups = await pMap(jobs, (job) => job(), {
        concurrency: 2,
    });

    const seen = new Set<string>();
    return groups.flat().filter(({ row }) => {
        const id = String(row.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

async function searchKnowledgeCatalogAcross(
    query: string,
    limit: number,
): Promise<ScopedKbCatalog[]> {
    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);
    const project = await getProjectLance();
    const global = getOpenedGlobalSearch();

    const jobs: Array<() => Promise<ScopedKbCatalog[]>> = [];

    if (project) {
        jobs.push(async () => {
            const rows = await project.search.kb.searchKnowledgeBases(
                query,
                {
                    limit: candidateLimit,
                    disableRerank: true,
                },
            );
            return rows.map((row) => ({ scope: "project" as const, row }));
        });
    }

    if (global) {
        jobs.push(async () => {
            const rows = await global.kb.searchKnowledgeBases(query, {
                limit: candidateLimit,
                disableRerank: true,
            });
            return rows.map((row) => ({ scope: "global" as const, row }));
        });
    }

    if (jobs.length === 0) return [];

    const groups = await pMap(jobs, (job) => job(), {
        concurrency: 2,
    });

    const seen = new Set<string>();
    return groups.flat().filter(({ row }) => {
        const id = String(row.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

/**
 * 无条件列出全部可用知识库目录（按 project → global 顺序，去重，截断到 limit）。
 * 用于 search_knowledge_bases 的 query 为空场景。
 */
async function listAllKnowledgeBases(
    limit: number,
): Promise<ScopedKbCatalog[]> {
    const project = await getProjectLance();
    const global = getOpenedGlobalSearch();

    const out: ScopedKbCatalog[] = [];
    const seen = new Set<string>();

    const collect = (
        entries: KbCatalogRow[],
        scope: Scope,
    ): boolean => {
        for (const row of entries) {
            const id = String(row.id);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({ scope, row });
            if (out.length >= limit) return false;
        }
        return true;
    };

    if (project) {
        if (!collect(await project.search.kb.listCatalogEntries(), "project")) {
            return out;
        }
    }
    if (global) {
        collect(await global.kb.listCatalogEntries(), "global");
    }

    return out;
}

async function findSkillRowById(id: string): Promise<ScopedSkill | null> {
    const project = await getProjectLance();
    if (project) {
        const row = await project.search.skill.getById(id);
        if (row) return { scope: "project", row };
    }

    const global = getOpenedGlobalSearch();
    if (global) {
        const row = await global.skill.getById(id);
        if (row) return { scope: "global", row };
    }

    return null;
}

function resolveExistingPath(raw: string): string {
    if (path.isAbsolute(raw)) return raw;
    try {
        const ctx = getRunnerContext();
        return ctx.prj.getPath(raw);
    } catch {
        return path.resolve(raw);
    }
}

function resolveSkillBaseDir(skillPath: string): string {
    const trimmed = skillPath.trim();
    if (!trimmed) {
        throw new Error("该 Skill 没有可用的目录路径，无法加载扩展文件。");
    }

    const abs = resolveExistingPath(trimmed);
    let stat: fs.Stats;
    try {
        stat = fs.statSync(abs);
    } catch {
        throw new Error(`Skill 路径不存在: ${abs}`);
    }

    return stat.isDirectory() ? abs : path.dirname(abs);
}

function resolveSkillExtensionPath(
    skillPath: string,
    relativePath: string,
): string {
    const rel = relativePath.trim();
    if (!rel) {
        throw new Error("path 不能为空。");
    }
    if (path.isAbsolute(rel)) {
        throw new Error("path 必须是相对于 Skill 目录的相对路径。");
    }

    const base = resolveSkillBaseDir(skillPath);
    const abs = path.resolve(base, rel);
    const relative = path.relative(base, abs);

    if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw new Error("path 不能超出 Skill 目录。");
    }

    return abs;
}

/**
 * 按 id 加载 Skill。
 *
 * - 不传 relativePath：返回 Skill 正文；
 * - 传 relativePath：视作相对 Skill 目录的路径，读取该文件并转 Markdown 返回，
 *   此时返回的是"扩展文件内容"，而不是 Skill 正文。
 *
 * 不对外暴露项目级/全局概念：id 来自 search_skills；内部按项目优先、全局兜底查找。
 */
export async function loadSkillById(
    id: string,
    relativePath?: string,
): Promise<LoadSkillResult> {
    const trimmedId = id.trim();
    if (!trimmedId) {
        return {
            found: false,
            error: "id 不能为空。",
            hint: "请使用 search_skills 返回的 id。",
        };
    }

    const found = await findSkillRowById(trimmedId);
    if (!found) {
        return {
            found: false,
            error: `未找到 Skill: ${trimmedId}`,
            hint: "请先调用 search_skills 获取有效 id。",
        };
    }

    const { row } = found;
    const base: LoadSkillResult = {
        found: true,
        id: String(row.id),
        name: String(row.name),
        description: String(row.description),
        metadata: parseMetadata(row.metadata),
    };

    if (relativePath && relativePath.trim()) {
        const absPath = resolveSkillExtensionPath(
            String(row.path ?? ""),
            relativePath,
        );
        const markdown = await loadTextFileStrict(absPath);
        return {
            ...base,
            path: absPath,
            text: markdown,
        };
    }

    return {
        ...base,
        path: String(row.path ?? ""),
        text: String(row.text ?? ""),
    };
}

function toChunkOutput(item: ScopedChunk): ChunkOutput {
    return {
        kbId: item.kbId,
        kbName: item.kbName || undefined,
        chunkId: String(item.row.id ?? ""),
        text: String(item.row.text ?? ""),
        title: String(item.row.title ?? ""),
        source: String(item.row.source ?? ""),
        metadata: parseMetadata(item.row.metadata),
    };
}

async function findKbById(id: string): Promise<FoundKb | null> {
    const project = await getProjectLance();
    if (project) {
        const entry = await project.search.kb.getCatalogEntry(id);
        if (entry) {
            const table = await resolveKbTable(project.search.kb, id);
            if (!table) {
                throw new Error(`知识库加载失败: ${id}`);
            }
            return { scope: "project", entry, table };
        }
    }

    const global = getOpenedGlobalSearch();
    if (global) {
        const entry = await global.kb.getCatalogEntry(id);
        if (entry) {
            const table = await resolveKbTable(global.kb, id);
            if (!table) {
                throw new Error(`知识库加载失败: ${id}`);
            }
            return { scope: "global", entry, table };
        }
    }

    return null;
}

async function queryKnowledgeById(
    id: string,
    query: string,
    limit: number,
): Promise<{ kbId: string; chunks: ChunkOutput[] }> {
    const found = await findKbById(id);
    if (!found) {
        throw new Error(`知识库不存在: ${id}`);
    }

    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);
    const rows = await found.table.searchChunks(query, {
        limit: candidateLimit,
        disableRerank: true,
    });

    const candidates: ScopedChunk[] = rows.map((row) => ({
        scope: found.scope,
        kbId: found.entry.id,
        kbName: found.entry.name,
        row,
    }));

    const reranked = await rerankCandidates(
        query,
        candidates,
        (item) => String(item.row.text ?? ""),
        limit,
    );

    return {
        kbId: found.entry.id,
        chunks: reranked.map(toChunkOutput),
    };
}

/**
 * 在指定 id 集合内检索知识库片段。
 *
 * 供 local agent 的固定知识库工具复用；id 不存在或查询失败时跳过该库。
 */
export async function queryKnowledgeByIds(
    ids: readonly string[],
    query: string,
    limit: number,
): Promise<ChunkOutput[]> {
    const uniqueIds = [
        ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
    ];
    if (uniqueIds.length === 0) return [];

    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);

    const groups = await pMap(
        uniqueIds,
        async (id): Promise<ScopedChunk[]> => {
            try {
                const found = await findKbById(id);
                if (!found) {
                    Logger.warn(`[ToolDB] 知识库不存在，已跳过: ${id}`);
                    return [];
                }

                const rows = await found.table.searchChunks(query, {
                    limit: candidateLimit,
                    disableRerank: true,
                });

                return rows.map((row) => ({
                    scope: found.scope,
                    kbId: found.entry.id,
                    kbName: found.entry.name,
                    row,
                }));
            } catch (error) {
                Logger.warn(
                    `[ToolDB] 查询知识库失败，已跳过: ${id}`,
                    error,
                );
                return [];
            }
        },
        { concurrency: SEARCH_CONCURRENCY },
    );

    const candidates = groups.flat();
    const reranked = await rerankCandidates(
        query,
        candidates,
        (item) => String(item.row.text ?? ""),
        limit,
    );

    return reranked.map(toChunkOutput);
}

/**
 * 汇总项目级与全局"可用"的知识库表。
 *
 * 名称来自 KbRegistry.listCatalogEntries()（稳定排序），而不是从已加载表
 * 里猜测。表未加载时先懒加载——启动期 restore() 已覆盖主要路径，这里
 * 是检索入口的防御层：某个库 restore 时失败被跳过，或项目级/全局注册表
 * 未走 restore，仍然可以自愈。懒加载失败的库 warn 并跳过，不阻断其它库。
 */
async function collectKbEntries(): Promise<
    Array<{ scope: Scope; kbId: string; kbName: string; table: KbTable }>
> {
    const project = await getProjectLance();
    const global = getOpenedGlobalSearch();

    const result: Array<{
        scope: Scope;
        kbId: string;
        kbName: string;
        table: KbTable;
    }> = [];

    if (project) {
        const catalog = await project.search.kb.listCatalogEntries();
        for (const entry of catalog) {
            const table = await resolveKbTable(project.search.kb, entry.id);
            if (!table) continue;
            result.push({
                scope: "project",
                kbId: entry.id,
                kbName: entry.name,
                table,
            });
        }
    }

    if (global) {
        const catalog = await global.kb.listCatalogEntries();
        for (const entry of catalog) {
            const table = await resolveKbTable(global.kb, entry.id);
            if (!table) continue;
            result.push({
                scope: "global",
                kbId: entry.id,
                kbName: entry.name,
                table,
            });
        }
    }

    return result;
}

export async function queryAllKnowledge(
    query: string,
    limit: number,
    offset = 0,
): Promise<ChunkOutput[]> {
    if (limit <= 0 || offset < 0) return [];

    const entries = await collectKbEntries();
    if (entries.length === 0) return [];

    // 全局分页：每个库至少要召回到 offset + limit，
    // 否则深页 chunk 可能不在任何库的候选集里，导致漏数据。
    const window = offset + limit;
    const candidateLimit = Math.max(
        window * CANDIDATE_MULTIPLIER,
        window,
    );

    const jobs = entries.map(
        ({ scope, kbId, kbName, table }) =>
            async (): Promise<ScopedChunk[]> => {
                const rows = await table.searchChunks(query, {
                    limit: candidateLimit,
                    disableRerank: true,
                });
                return rows.map(
                    (row): ScopedChunk => ({
                        scope,
                        kbId,
                        kbName,
                        row,
                    }),
                );
            },
    );

    const groups = await pMap(jobs, (job) => job(), {
        concurrency: SEARCH_CONCURRENCY,
    });

    const candidates = groups.flat();
    const reranked = await rerankCandidates(
        query,
        candidates,
        (item) => String(item.row.text ?? ""),
        window,
    );

    return reranked
        .slice(offset, offset + limit)
        .map(toChunkOutput);
}

const skillRefSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    path: z.string().optional(),
});

const skillSearchOutputSchema = z.object({
    skills: z.array(skillRefSchema),
    hint: z.string().optional(),
});

const loadSkillOutputSchema = z.object({
    found: z.boolean(),
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    path: z.string().optional(),
    text: z.string().optional(),
    metadata: z.unknown().optional(),
    error: z.string().optional(),
    hint: z.string().optional(),
});

const kbRefSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
});

const kbSearchOutputSchema = z.object({
    knowledgeBases: z.array(kbRefSchema),
    hint: z.string().optional(),
});

const chunkOutputSchema = z.object({
    kbId: z.string(),
    kbName: z.string().optional(),
    chunkId: z.string(),
    text: z.string(),
    title: z.string(),
    source: z.string(),
    metadata: z.unknown().optional(),
});

const queryKnowledgeOutputSchema = z.object({
    kbId: z.string().optional(),
    chunks: z.array(chunkOutputSchema),
    error: z.string().optional(),
    hint: z.string().optional(),
});

const queryAllKnowledgeOutputSchema = z.object({
    chunks: z.array(chunkOutputSchema),
    error: z.string().optional(),
    hint: z.string().optional(),
});

const searchSkillsInputSchema = z.object({
    query: z
        .string()
        .min(1)
        .describe(`Natural-language description of the capability or task scenario, e.g. "extract tables from PDF steps", "code review workflow". Do not pass a skill name.`),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(`Maximum number of skills to return. Default 8.`),
});

const loadSkillInputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe("Skill id returned by search_skills. Do not construct it yourself."),
    path: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
            `Only when the skill body or description instructs loading an extension file. Path relative to the skill directory; must not be absolute or escape the directory. When set, returns that file's content instead of the skill body. Omit on the first call.`
            // "第二次调用时使用。首次只传 id，返回 Skill 正文；" +
            // "当 Skill 正文/描述要求加载扩展文件时，以相同 id + 该扩展文件再次调用，" +
            // "此时返回的是该扩展文件的 Markdown 内容（而非 Skill 正文）。",
        ),
});

const searchKnowledgeBasesInputSchema = z.object({
    query: z
        .string()
        .trim()
        .describe(
            `Topic covered by the target knowledge base, e.g. "project architecture conventions", "user writing preferences", "deployment constraints". This is a topic, not a specific question — use query_knowledge or query_all_knowledge for questions. Leave empty to list all available knowledge bases and assess whether any covers a topic of interest.`
            // "知识主题的自然语言描述。留空则返回全部可用知识库；非空时按相关度排序返回。",
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of knowledge bases to return. Default 8."),
});

const queryKnowledgeInputSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe("Knowledge-base id returned by search_knowledge_bases. Do not construct it yourself."),
    query: z
        .string()
        .min(1)
        .describe(`Natural-language question to search within this knowledge base, e.g. "what is the API versioning policy".`),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of chunks to return. Default 8."),
});

const queryAllKnowledgeInputSchema = z.object({
    query: z
        .string()
        .min(1)
        .describe(`Natural-language expression of the information gap or preference question, e.g. "project convention for error log format", "preferred commit message style", "deployment constraints for this service". Do not put tool usage, schema definitions, or generic concept questions here.`),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of chunks to return. Default 8."),
});

type SearchSkillsInput = z.infer<typeof searchSkillsInputSchema>;
type SearchSkillsOutput = z.infer<typeof skillSearchOutputSchema>;
type LoadSkillInput = z.infer<typeof loadSkillInputSchema>;
type LoadSkillOutput = z.infer<typeof loadSkillOutputSchema>;
type SearchKnowledgeBasesInput = z.infer<
    typeof searchKnowledgeBasesInputSchema
>;
type SearchKnowledgeBasesOutput = z.infer<typeof kbSearchOutputSchema>;
type QueryKnowledgeInput = z.infer<typeof queryKnowledgeInputSchema>;
type QueryKnowledgeOutput = z.infer<typeof queryKnowledgeOutputSchema>;
type QueryAllKnowledgeInput = z.infer<typeof queryAllKnowledgeInputSchema>;
type QueryAllKnowledgeOutput = z.infer<typeof queryAllKnowledgeOutputSchema>;

export const searchSkillsToolDef: ToolDefinition<
    SearchSkillsInput,
    SearchSkillsOutput
> = {
    name: searchSkillsToolName,
    description: 'Search the skill index for a reusable capability. Use when you need a procedure, method, workflow, or best practice for a node, or when unsure whether an existing skill covers it. Do not use to find tools (use search_tools) or facts/preferences (use query_all_knowledge). Describe the capability or task scenario in natural language; do not guess skill names. Returns: id, name, description, ranked by relevance. On a hit, call load_skill with the id. Do not infer skill content from name.',
    // "检索可用 Skill（技能）。用自然语言描述能力或任务场景，而不是猜 Skill 名。" +
    // "返回按相关度排序的 id、name、description。" +
    // "命中后调用 load_skill 并传 id 加载正文；不要凭 name 猜测 Skill 内容。",
    inputSchema: searchSkillsInputSchema,
    outputSchema: skillSearchOutputSchema,
    execute: async ({ query, limit }) => {
        try {
            const finalLimit = limit ?? DEFAULT_LIMIT;
            const candidates = await searchSkillsAcross(query, finalLimit);

            const reranked = await rerankCandidates(
                query,
                candidates,
                (item) => `${item.row.name}\n${item.row.description}`,
                finalLimit,
            );

            const skills = reranked.map((item) => {
                const skillPath = String(item.row.path ?? "");
                return {
                    id: String(item.row.id),
                    name: String(item.row.name),
                    description: String(item.row.description),
                    ...(skillPath ? { path: skillPath } : {}),
                };
            });

            return {
                skills,
                hint: skills.length > 0 ? undefined : NO_SKILL_HINT,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            Logger.warn(
                "[ToolDB] search_skills 检索失败，返回空结果。",
                error,
            );
            return {
                skills: [],
                hint: `Skill search failed: ${message}. Retry later; if it persists, rephrase the capability or confirm the skill is available.`,
                // `检索 Skill 失败：${message}。` +
                // "可稍后重试；如持续失败，请换一种能力描述或确认 Skill 是否可用。",
            };
        }
    },
};

export const loadSkillToolDef: ToolDefinition<
    LoadSkillInput,
    LoadSkillOutput
> = {
    name: loadSkillToolName,
    description: `Load a skill body, or read an extension file inside a loaded skill's directory. Use when search_skills returned a matching id and you need the body to follow the method. Do not guess content from name, and do not construct an id without search_skills. Returns: with no path, the skill body in text; with path, the Markdown content of that file relative to the skill directory, not the skill body.`,
    // "加载 search_skills 返回的 Skill。id 必须使用 search_skills 返回的 id。" +
    // "首次调用只传 id，返回 Skill 正文；" +
    // "若 Skill 正文/描述要求加载扩展文件，以相同 id 加 path 再次调用（path 是该扩展文件相对 Skill 目录的路径），" +
    // "此时返回的是该扩展文件的 Markdown 内容（而非 Skill 正文）。" +
    // "不要凭 Skill 名猜测或编造正文。",
    inputSchema: loadSkillInputSchema,
    outputSchema: loadSkillOutputSchema,
    execute: async ({ id, path: relativePath }) => {
        try {
            return await loadSkillById(id, relativePath);
        } catch (error) {
            return {
                found: false,
                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
                hint: `Confirm the id comes from search_skills and that path is a relative path inside the skill directory.`,
                // "请确认 id 来自 search_skills，且 path 是 Skill 目录内的相对路径。",
            };
        }
    },
};

export const searchKnowledgeBasesToolDef: ToolDefinition<
    SearchKnowledgeBasesInput,
    SearchKnowledgeBasesOutput
> = {
    name: searchKnowledgeBasesToolName,
    description: `The knowledge base stores personal preferences and private knowledge — user preferences, project constraints, historical decisions, and private facts — not tool manuals or general reference. This tool searches its catalog, not chunks: it returns available knowledge bases with their id, name, and description. Use when (1) a fact, constraint, historical decision, or preference is needed but you don't know which base covers it, so the base must be located before calling query_knowledge; (2) you want to confirm whether a topic is already covered by an existing base; or (3) query is empty, to list all available bases and assess coverage. Do not use to retrieve chunks — call query_knowledge (one known base) or query_all_knowledge (all bases, when the target is unknown) — for tool usage (use search_skills or the tool schema), or for general concept questions, since this knowledge base is private, not an encyclopedia. Returns: id, name, description per base; all entries when query is empty, otherwise ranked by relevance.`,
    // "检索知识库目录。query 为空时返回全部可用知识库；非空时按相关度排序返回。" +
    // "每项含 id、name、description。命中后调用 query_knowledge 并传 id 检索该库的具体片段。",
    inputSchema: searchKnowledgeBasesInputSchema,
    outputSchema: kbSearchOutputSchema,
    execute: async ({ query, limit }) => {
        try {
            const finalLimit = limit ?? DEFAULT_LIMIT;
            const q = query.trim();

            if (!q) {
                const all = await listAllKnowledgeBases(finalLimit);
                const knowledgeBases = all.map((item) => ({
                    id: String(item.row.id),
                    name: String(item.row.name),
                    description: String(item.row.description),
                }));
                return {
                    knowledgeBases,
                    hint:
                        knowledgeBases.length > 0
                            ? undefined
                            : NO_KB_HINT,
                };
            }

            const candidates = await searchKnowledgeCatalogAcross(
                q,
                finalLimit,
            );

            const reranked = await rerankCandidates(
                q,
                candidates,
                (item) => `${item.row.name}\n${item.row.description}`,
                finalLimit,
            );

            const knowledgeBases = reranked.map((item) => ({
                id: String(item.row.id),
                name: String(item.row.name),
                description: String(item.row.description),
            }));

            return {
                knowledgeBases,
                hint:
                    knowledgeBases.length > 0
                        ? undefined
                        : NO_KB_HINT,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            Logger.warn(
                "[ToolDB] search_knowledge_bases 检索失败，返回空结果。",
                error,
            );
            return {
                knowledgeBases: [],
                hint: `Knowledge-base catalog search failed: ${message}. Retry later; if it persists, rephrase the topic. If the target base is already known, call query_knowledge directly; otherwise use query_all_knowledge to search across all available bases without selecting one first.`,
                // `检索知识库目录失败：${message}。` +
                // "可稍后重试；如持续失败，请换一种知识主题描述。",
            };
        }
    },
};

export const queryKnowledgeToolDef: ToolDefinition<
    QueryKnowledgeInput,
    QueryKnowledgeOutput
> = {
    name: queryKnowledgeToolName,
    description: `Retrieve chunks from one specified knowledge base. Use when you already have a knowledge-base id from search_knowledge_bases and the fact or preference is known to live in that base. Do not call without an id, and do not probe multiple bases one by one when the target is uncertain; use query_all_knowledge instead. Returns: chunks ranked by relevance, each with kbId, kbName, chunkId, text, title, source, metadata.`,
    // "在指定知识库中检索具体片段。id 必须使用 search_knowledge_bases 返回的 id。",
    inputSchema: queryKnowledgeInputSchema,
    outputSchema: queryKnowledgeOutputSchema,
    execute: async ({ id, query, limit }) => {
        try {
            const result = await queryKnowledgeById(
                id,
                query,
                limit ?? DEFAULT_LIMIT,
            );

            return {
                kbId: result.kbId,
                chunks: result.chunks,
            };
        } catch (error) {
            return {
                chunks: [],
                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
                hint: `Call search_knowledge_bases first to obtain a valid id.`,
                // "请先调用 search_knowledge_bases 获取有效 id。",
            };
        }
    },
};

export const queryAllKnowledgeToolDef: ToolDefinition<
    QueryAllKnowledgeInput,
    QueryAllKnowledgeOutput
> = {
    name: queryAllKnowledgeToolName,
    description: `Retrieve chunks from all available knowledge bases. The knowledge base stores personal preferences, project constraints, historical decisions, and private facts — not tool manuals or general reference. Use when any of the following holds: (1) a fact, constraint, or historical decision required to complete the current node is missing from context; (2) more than one valid approach exists and user preference or project convention decides which; (3) you need to confirm whether a claim is consistent with an established preference or constraint. Do not use for tool usage (use search_skills or the tool schema), and do not defer to post-failure correction — this tool provides preferences and private constraints before action. Returns: chunks ranked by relevance across all bases, each with kbId, kbName, chunkId, text, title, source, metadata.`,
    // "在全部可用知识库中检索与 query 相关的片段。" +
    // "知识库存放用户专有/私有知识、事实、偏好、项目约束等；" +
    // "当回答需要用户信息或项目背景，或需要确认某个事实/偏好/约定的来源时使用。",
    inputSchema: queryAllKnowledgeInputSchema,
    outputSchema: queryAllKnowledgeOutputSchema,
    execute: async ({ query, limit }) => {
        try {
            const chunks = await queryAllKnowledge(
                query,
                limit ?? DEFAULT_LIMIT,
            );

            return {
                chunks,
                hint:
                    chunks.length > 0
                        ? undefined
                        : NO_KB_CHUNK_HINT,
            };
        } catch (error) {
            return {
                chunks: [],
                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
                hint: `Confirm the knowledge bases are available; if the target base is known, prefer search_knowledge_bases + query_knowledge.`,
                // "请确认知识库可用；如已知目标库，优先使用 search_knowledge_bases + query_knowledge。",
            };
        }
    },
};

export const searchSkillsTool = buildAiTool(searchSkillsToolDef);
export const loadSkillTool = buildAiTool(loadSkillToolDef);
export const searchKnowledgeBasesTool = buildAiTool(
    searchKnowledgeBasesToolDef,
);
export const queryKnowledgeTool = buildAiTool(queryKnowledgeToolDef);
export const queryAllKnowledgeTool = buildAiTool(
    queryAllKnowledgeToolDef,
);