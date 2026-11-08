// packages/main/src/libs/tooldb/tools/meta-tools/rag.ts
import { LanceDB } from "$libs/project/controllers/lance/index.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import type {
    KbCatalogRow,
    KbChunkRow,
    KbTable,
    SkillRow,
} from "$libs/searchsrv/index.js";
import {
    getGlobalRerankService,
    getGlobalSearchDB,
} from "$libs/searchsrv/index.js";
import Logger from "electron-log/main.js";
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

const NO_SKILL_HINT =
    "没有找到匹配的 Skill。请先确认技能目录是否已同步；" +
    "如确实需要新能力，请换一个能力描述重新检索，不要用同义关键词反复重试。";

const NO_KB_HINT =
    "没有找到匹配的知识库目录。请先确认知识库目录及 meta.json 是否已同步；" +
    "如果明确知道知识库 ref，也可以直接调用 query_knowledge。";

const NO_KB_CHUNK_HINT =
    "没有检索到知识库片段。可能是知识库为空、文件读取失败，或查询与内容不匹配。";

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

interface Ranked<T> {
    item: T;
    score: number | null;
}

interface ChunkOutput {
    ref: string;
    scope: Scope;
    kbId: string;
    kbName?: string;
    chunkId: string;
    text: string;
    title: string;
    source: string;
    metadata?: unknown;
    rerankScore?: number;
}

function makeRef(scope: Scope, id: string): string {
    return scope === "project" ? `prj::${id}` : id;
}

function parseRef(ref: string): { scope: Scope; id: string } {
    const trimmed = ref.trim();
    if (trimmed.startsWith("prj::")) {
        return {
            scope: "project",
            id: trimmed.slice("prj::".length),
        };
    }
    return {
        scope: "global",
        id: trimmed,
    };
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

/**
 * 从 Rerank 结果条目中提取分数。
 *
 * 兼容不同实现的字段名；均缺失时返回 null，最终不写入 rerankScore，
 * 以保持"可选"的语义，避免把 undefined 写进输出。
 */
function extractRerankScore(item: unknown): number | null {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;
    for (const key of [
        "score",
        "rerankScore",
        "relevanceScore",
        "relevance_score",
    ]) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
    }
    return null;
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

async function rerankCandidates<T>(
    query: string,
    items: T[],
    getText: (item: T) => string,
    limit: number,
): Promise<Ranked<T>[]> {
    const fallback = (): Ranked<T>[] =>
        items.slice(0, limit).map((item) => ({ item, score: null }));

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

        const ranked: Ranked<T>[] = [];
        for (const r of result.ranking) {
            const item = items[r.originalIndex];
            if (!item) continue;
            ranked.push({ item, score: extractRerankScore(r) });
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

    return groups.flat();
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

    return groups.flat();
}

async function findSkillRow(
    scope: Scope,
    id: string,
): Promise<SkillRow | null> {
    if (scope === "project") {
        const project = await getProjectLance();
        return project ? project.search.skill.getById(id) : null;
    }
    const global = getOpenedGlobalSearch();
    return global ? global.skill.getById(id) : null;
}

async function loadSkillByRef(ref: string): Promise<{
    ref: string;
    scope: Scope;
    id: string;
    name: string;
    description: string;
    path: string;
    text: string;
    metadata: Record<string, unknown>;
} | null> {
    const { scope, id } = parseRef(ref);
    const row = await findSkillRow(scope, id);
    if (!row) return null;

    return {
        ref: makeRef(scope, String(row.id)),
        scope,
        id: String(row.id),
        name: String(row.name),
        description: String(row.description),
        path: String(row.path ?? ""),
        // SkillTable.getById 已把 __skillBody 还原到 text，
        // 并从 metadata 中剥离该 key，下游不再需要感知具体 key。
        text: String(row.text ?? ""),
        metadata: parseMetadata(row.metadata),
    };
}

function toChunkOutput(ranked: Ranked<ScopedChunk>): ChunkOutput {
    const { item, score } = ranked;
    return {
        ref: makeRef(item.scope, item.kbId),
        scope: item.scope,
        kbId: item.kbId,
        kbName: item.kbName || undefined,
        chunkId: String(item.row.id ?? ""),
        text: String(item.row.text ?? ""),
        title: String(item.row.title ?? ""),
        source: String(item.row.source ?? ""),
        metadata: parseMetadata(item.row.metadata),
        ...(score !== null ? { rerankScore: score } : {}),
    };
}

async function queryKnowledgeByRef(
    ref: string,
    query: string,
    limit: number,
): Promise<{
    ref: string;
    scope: Scope;
    kbId: string;
    chunks: ChunkOutput[];
}> {
    const { scope, id } = parseRef(ref);

    const registry =
        scope === "project"
            ? (await getProjectLance())?.search.kb
            : getOpenedGlobalSearch()?.kb;

    if (!registry) {
        throw new Error(
            scope === "project"
                ? "项目级 LanceDB 不可用，无法检索知识库。"
                : "全局检索库不可用，无法检索知识库。",
        );
    }

    const table = registry.tryGet(id);
    if (!table) {
        throw new Error(`知识库未加载或不存在: ${ref}`);
    }

    const catalog = await registry.getCatalogEntry(id);
    const kbName = catalog?.name ?? id;

    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);
    const rows = await table.searchChunks(query, {
        limit: candidateLimit,
        disableRerank: true,
    });

    const candidates: ScopedChunk[] = rows.map((row) => ({
        scope,
        kbId: id,
        kbName,
        row,
    }));

    const reranked = await rerankCandidates(
        query,
        candidates,
        (item) => String(item.row.text ?? ""),
        limit,
    );

    return {
        ref: makeRef(scope, id),
        scope,
        kbId: id,
        chunks: reranked.map(toChunkOutput),
    };
}

/**
 * 汇总项目级与全局"已加载"的知识库表。
 *
 * 名称来自 KbRegistry.listCatalogEntries()（稳定排序），
 * 而不是已加载表里猜测；未加载表在两侧都可能存在，跳过并 debug 记录。
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
            const table = project.search.kb.tryGet(entry.id);
            if (!table) {
                Logger.debug(
                    `[ToolDB] 项目级知识库目录 [${entry.id}] 存在但未加载，已跳过。`,
                );
                continue;
            }
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
            const table = global.kb.tryGet(entry.id);
            if (!table) {
                Logger.debug(
                    `[ToolDB] 全局知识库目录 [${entry.id}] 存在但未加载，已跳过。`,
                );
                continue;
            }
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

async function queryAllKnowledge(
    query: string,
    limit: number,
): Promise<ChunkOutput[]> {
    const entries = await collectKbEntries();
    if (entries.length === 0) return [];

    const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, limit);

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
        limit,
    );

    return reranked.map(toChunkOutput);
}

const scopeSchema = z.enum(["project", "global"]);

const skillRefSchema = z.object({
    ref: z.string(),
    scope: scopeSchema,
    id: z.string(),
    name: z.string(),
    description: z.string(),
    path: z.string().optional(),
    rerankScore: z.number().optional(),
});

const skillSearchOutputSchema = z.object({
    skills: z.array(skillRefSchema),
    hint: z.string().optional(),
});

const loadSkillOutputSchema = z.object({
    found: z.boolean(),
    ref: z.string().optional(),
    scope: scopeSchema.optional(),
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
    ref: z.string(),
    scope: scopeSchema,
    id: z.string(),
    name: z.string(),
    description: z.string(),
    rerankScore: z.number().optional(),
});

const kbSearchOutputSchema = z.object({
    knowledgeBases: z.array(kbRefSchema),
    hint: z.string().optional(),
});

const chunkOutputSchema = z.object({
    ref: z.string(),
    scope: scopeSchema,
    kbId: z.string(),
    kbName: z.string().optional(),
    chunkId: z.string(),
    text: z.string(),
    title: z.string(),
    source: z.string(),
    metadata: z.unknown().optional(),
    rerankScore: z.number().optional(),
});

const queryKnowledgeOutputSchema = z.object({
    ref: z.string().optional(),
    scope: scopeSchema.optional(),
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
        .describe("用自然语言描述你希望加载的能力或任务场景。"),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("最多返回的 Skill 数，默认 8。"),
});

const loadSkillInputSchema = z.object({
    ref: z
        .string()
        .min(1)
        .describe(
            "search_skills 返回的 ref。项目级形如 prj::skill:dir；全局级不带前缀。",
        ),
});

const searchKnowledgeBasesInputSchema = z.object({
    query: z
        .string()
        .min(1)
        .describe("用自然语言描述你要查找的知识主题。"),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("最多返回的知识库数，默认 8。"),
});

const queryKnowledgeInputSchema = z.object({
    ref: z
        .string()
        .min(1)
        .describe(
            "search_knowledge_bases 返回的知识库 ref。项目级形如 prj::<kbId>；全局级不带前缀。",
        ),
    query: z
        .string()
        .min(1)
        .describe("要在该知识库中检索的自然语言问题。"),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("最多返回的 chunk 数，默认 8。"),
});

const queryAllKnowledgeInputSchema = z.object({
    query: z
        .string()
        .min(1)
        .describe("要在全部知识库中检索的自然语言问题。"),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("最终返回的 chunk 数，默认 8。"),
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
    description:
        "检索可用的 Skill（技能）。描述你想完成的能力或任务场景，而不是猜 Skill 名。" +
        "会并行检索项目级与全局 Skill，合并后 Rerank，返回 ref/name/description 及可选 rerankScore。" +
        "项目级 ref 以 prj:: 开头，全局级不带前缀。" +
        "命中后请调用 load_skill 加载正文；不要凭 name 猜测 Skill 内容。",
    inputSchema: searchSkillsInputSchema,
    outputSchema: skillSearchOutputSchema,
    execute: async ({ query, limit }) => {
        const finalLimit = limit ?? DEFAULT_LIMIT;
        const candidates = await searchSkillsAcross(query, finalLimit);

        const reranked = await rerankCandidates(
            query,
            candidates,
            (item) => `${item.row.name}\n${item.row.description}`,
            finalLimit,
        );

        const skills = reranked.map(({ item, score }) => ({
            ref: makeRef(item.scope, String(item.row.id)),
            scope: item.scope,
            id: String(item.row.id),
            name: String(item.row.name),
            description: String(item.row.description),
            path: String(item.row.path ?? ""),
            ...(score !== null ? { rerankScore: score } : {}),
        }));

        return {
            skills,
            hint: skills.length > 0 ? undefined : NO_SKILL_HINT,
        };
    },
};

export const loadSkillToolDef: ToolDefinition<
    LoadSkillInput,
    LoadSkillOutput
> = {
    name: loadSkillToolName,
    description:
        "加载 search_skills 命中的 Skill 正文。必须使用 search_skills 返回的 ref。" +
        "项目级 ref 以 prj:: 开头；全局级不带前缀。" +
        "不要凭 Skill 名猜测或编造正文。",
    inputSchema: loadSkillInputSchema,
    outputSchema: loadSkillOutputSchema,
    execute: async ({ ref }) => {
        const skill = await loadSkillByRef(ref);

        if (!skill) {
            return {
                found: false,
                error: `未找到 Skill: ${ref}`,
                hint:
                    "请先调用 search_skills 获取有效 ref；项目级 ref 形如 prj::skill:dir，全局级不带前缀。",
            };
        }

        return {
            found: true,
            ...skill,
        };
    },
};

export const searchKnowledgeBasesToolDef: ToolDefinition<
    SearchKnowledgeBasesInput,
    SearchKnowledgeBasesOutput
> = {
    name: searchKnowledgeBasesToolName,
    description:
        "检索知识库目录，而不是直接检索知识库内容。描述你要查找的知识主题，" +
        "会并行检索项目级与全局知识库目录，合并后 Rerank，返回知识库 ref/name/description 及可选 rerankScore。" +
        "项目级 ref 以 prj:: 开头，全局级不带前缀。" +
        "命中后请调用 query_knowledge 检索该库的具体 chunk。",
    inputSchema: searchKnowledgeBasesInputSchema,
    outputSchema: kbSearchOutputSchema,
    execute: async ({ query, limit }) => {
        const finalLimit = limit ?? DEFAULT_LIMIT;
        const candidates = await searchKnowledgeCatalogAcross(
            query,
            finalLimit,
        );

        const reranked = await rerankCandidates(
            query,
            candidates,
            (item) => `${item.row.name}\n${item.row.description}`,
            finalLimit,
        );

        const knowledgeBases = reranked.map(({ item, score }) => ({
            ref: makeRef(item.scope, String(item.row.id)),
            scope: item.scope,
            id: String(item.row.id),
            name: String(item.row.name),
            description: String(item.row.description),
            ...(score !== null ? { rerankScore: score } : {}),
        }));

        return {
            knowledgeBases,
            hint:
                knowledgeBases.length > 0
                    ? undefined
                    : NO_KB_HINT,
        };
    },
};

export const queryKnowledgeToolDef: ToolDefinition<
    QueryKnowledgeInput,
    QueryKnowledgeOutput
> = {
    name: queryKnowledgeToolName,
    description:
        "在指定知识库中检索具体 chunk。ref 必须来自 search_knowledge_bases。" +
        "项目级 ref 以 prj:: 开头；全局级不带前缀。" +
        "检索会先禁用内置 Rerank 扩大候选，再统一 Rerank 返回最终片段及可选 rerankScore。",
    inputSchema: queryKnowledgeInputSchema,
    outputSchema: queryKnowledgeOutputSchema,
    execute: async ({ ref, query, limit }) => {
        try {
            return await queryKnowledgeByRef(
                ref,
                query,
                limit ?? DEFAULT_LIMIT,
            );
        } catch (error) {
            return {
                chunks: [],
                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
                hint:
                    "请先调用 search_knowledge_bases 获取有效知识库 ref；" +
                    "项目级 ref 形如 prj::<kbId>，全局级不带前缀。",
            };
        }
    },
};

export const queryAllKnowledgeToolDef: ToolDefinition<
    QueryAllKnowledgeInput,
    QueryAllKnowledgeOutput
> = {
    name: queryAllKnowledgeToolName,
    description:
        "不指定知识库，直接从全部项目级与全局知识库中检索 chunk，并统一 Rerank。" +
        "适合不知道知识属于哪个库、或需要跨库召回的场景。" +
        "如果已知目标库，优先使用 search_knowledge_bases + query_knowledge，以减少无关召回。" +
        "返回的 chunk 带 kbName 与可选 rerankScore。",
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
                hint:
                    "请确认项目级/全局检索库已打开，且知识库目录已同步。",
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