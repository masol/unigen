// packages/main/src/libs/blueprint/capability/local/agent/context-tools.ts
import { LanceDB } from "$libs/project/controllers/lance/index.js";
import type { ProjectSearchDB } from "$libs/project/controllers/lance/project-search-db.js";
import type { KbCatalogRow } from "$libs/searchsrv/tables/kb-catalog-table.js";
import {
    loadSkillById,
    queryKnowledgeByIds,
} from "$libs/tooldb/tools/meta-tools/rag.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import { tool, type Tool } from "ai";
import Logger from "electron-log/main.js";
import { z } from "zod";
import type { CompiledPacAgent } from "../type.js";

export const LOAD_LOCAL_SKILL_TOOL_NAME = "load_locskill";
export const QUERY_LOCAL_KB_TOOL_NAME = "query_lockc";

const KB_DEFAULT_LIMIT = 5;
const KB_MAX_LIMIT = 20;

interface ResolvedSkillRef {
    id: string;
    name: string;
    description: string;
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

function skillIdCandidates(id: string): string[] {
    const candidates = [id];
    if (id.startsWith("skill:")) {
        const bare = id.slice("skill:".length);
        if (bare) candidates.push(bare);
    } else {
        candidates.push(`skill:${id}`);
    }
    return [...new Set(candidates)];
}

async function resolveSkillRef(
    id: string,
    compiled: CompiledPacAgent,
): Promise<ResolvedSkillRef | null> {
    for (const candidate of skillIdCandidates(id)) {
        try {
            const result = await loadSkillById(candidate);
            if (result.found) {
                return {
                    id: result.id ?? candidate,
                    name: result.name ?? candidate,
                    description: result.description ?? "",
                };
            }
        } catch (error) {
            Logger.warn(
                `[PAC] ${compiled.name}: 读取技能失败，已忽略: ${candidate}`,
                error,
            );
        }
    }

    Logger.warn(`[PAC] ${compiled.name}: 本地技能不存在，已忽略: ${id}`);
    return null;
}

export async function attachLocalContextTools(
    tools: Record<string, Tool>,
    compiled: CompiledPacAgent,
    ctx: IRunnerContext,
    extraSkillIds: string[] = [],
): Promise<void> {
    const compiledSkillIds = readStringList(
        compiled.config.skills,
        "skills",
        compiled.sourcePath,
    ).map(normalizeSkillId);

    // ctx.skills 中的字符串通常已经是完整 skill id；这里仍保留原始值，
    // 由 resolveSkillRef 做带/不带 skill: 前缀的候选回退。
    const runtimeSkillIds: string[] = [];
    for (const value of extraSkillIds) {
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed) runtimeSkillIds.push(trimmed);
    }

    const skillIds = [...new Set([...compiledSkillIds, ...runtimeSkillIds])];
    const kbIds = readStringList(
        compiled.config.knowledgeBases,
        "knowledgeBases",
        compiled.sourcePath,
    );

    if (skillIds.length === 0 && kbIds.length === 0) return;

    if (skillIds.length > 0) {
        await attachSkillTool(tools, compiled, skillIds);
    }

    if (kbIds.length > 0) {
        const search = await getProjectSearchDB(ctx);
        if (!search) {
            Logger.warn(
                `[PAC] ${compiled.name}: 项目 LanceDB 不可用，跳过 knowledgeBases 工具注入`,
            );
            return;
        }
        await attachKbTool(tools, compiled, search, kbIds);
    }
}

async function attachSkillTool(
    tools: Record<string, Tool>,
    compiled: CompiledPacAgent,
    skillIds: string[],
): Promise<void> {
    if (tools[LOAD_LOCAL_SKILL_TOOL_NAME]) {
        Logger.error(
            `[PAC] ${compiled.name}: 已存在工具 ${LOAD_LOCAL_SKILL_TOOL_NAME}，跳过本地技能工具注入`,
        );
        return;
    }

    const ids = [...new Set(skillIds)];
    const resolved: ResolvedSkillRef[] = [];
    const seen = new Set<string>();

    for (const id of ids) {
        const ref = await resolveSkillRef(id, compiled);
        if (!ref || seen.has(ref.id)) continue;
        seen.add(ref.id);
        resolved.push(ref);
    }

    if (resolved.length === 0) return;

    const skillIdsInDb = resolved.map((skill) => skill.id);
    const idSchema = z.enum(skillIdsInDb as [string, ...string[]]);

    tools[LOAD_LOCAL_SKILL_TOOL_NAME] = tool({
        description: buildSkillToolDescription(resolved),
        inputSchema: z.object({
            id: idSchema.describe("要加载的 Skill id，必须使用描述中列出的完整 id"),
            path: z
                .string()
                .trim()
                .min(1)
                .optional()
                .describe(
                    "第二次调用时使用。首次只传 id，返回 Skill 正文；" +
                    "当 Skill 正文/描述要求加载扩展文件时，以相同 id + 该扩展文件相对 Skill 目录的路径再次调用，" +
                    "此时返回的是该扩展文件的 Markdown 内容（而非 Skill 正文）。",
                ),
        }),
        execute: async (input) => {
            const { id, path: relativePath } = input as {
                id: string;
                path?: string;
            };

            const result = await loadSkillById(id, relativePath);
            if (!result.found) {
                throw new Error(result.error ?? `本地技能不存在: ${id}`);
            }

            if (relativePath) {
                return result.text ?? "";
            }

            return [
                `# ${result.name ?? id}`,
                "",
                result.description ?? "",
                "",
                result.text ?? "",
            ].join("\n");
        },
    });

    Logger.debug(
        `[PAC] ${compiled.name}: 已注入本地技能工具 ${LOAD_LOCAL_SKILL_TOOL_NAME}，技能数=${resolved.length}`,
    );
}

function buildSkillToolDescription(skills: ResolvedSkillRef[]): string {
    const rows = skills
        .map((skill) => {
            const name = escapeTableCell(skill.name);
            const description = escapeTableCell(skill.description);
            return `| \`${skill.id}\` | ${name} | ${description} |`;
        })
        .join("\n");

    return [
        "加载本 agent 可用的 Skill。",
        "",
        `本次可用 Skill ${skills.length} 个：`,
        "",
        "| Skill id | 名称 | 描述 |",
        "| --- | --- | --- |",
        rows,
        "",
        "调用规则：",
        "- 当任务需要该 Skill 的具体步骤、约束、示例或完整说明时调用本工具。",
        "- 参数 id 必须使用上表中的完整 Skill id，不要自行拼接或猜测。",
        "- 一次只加载当前需要的 Skill，避免一次性加载全部正文。",
        "- 首次调用只传 id，返回 Skill 正文。",
        "- 若 Skill 正文/描述要求加载扩展文件，以相同 id 加 path 再次调用；path 是该扩展文件相对 Skill 目录的路径，此时返回该扩展文件的 Markdown 内容（而非 Skill 正文）。",
        "- 返回内容是 Markdown，直接阅读理解后继续执行任务。",
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

    const idEnum = z.enum(
        entries.map((entry) => entry.id) as [string, ...string[]],
    );

    tools[QUERY_LOCAL_KB_TOOL_NAME] = tool({
        description: buildKbToolDescription(entries),
        inputSchema: z.object({
            query: z.string().min(1).describe("自然语言查询"),
            id: idEnum
                .optional()
                .describe(
                    "可选。已知目标知识库时传入其 id，只检索该库；不确定时不要传，工具会在全部可用库中检索。",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(KB_MAX_LIMIT)
                .optional()
                .describe(`返回条数，默认 ${KB_DEFAULT_LIMIT}，最大 ${KB_MAX_LIMIT}`),
        }),
        execute: async (input) => {
            const { query, id, limit: rawLimit } = input as {
                query: string;
                id?: string;
                limit?: number;
            };
            const limit = Math.min(
                KB_MAX_LIMIT,
                Math.max(1, Math.floor(rawLimit ?? KB_DEFAULT_LIMIT)),
            );

            const ids = id ? [id] : entries.map((entry) => entry.id);
            const chunks = await queryKnowledgeByIds(ids, query, limit);

            return JSON.stringify(chunks, null, 2);
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
        "检索本 agent 可用的知识库。",
        "知识库存放用户专有/私有知识、事实、偏好、项目约束等；当回答需要这些背景信息时使用。",
        "",
        `本次可用知识库 ${entries.length} 个：`,
        "",
        "| 知识库 id | 名称 | 描述 |",
        "| --- | --- | --- |",
        rows,
        "",
        "调用参数：",
        "- `query`：自然语言查询，必填。",
        "- `id`：可选。已知目标知识库时传入其 id，只检索该库；不确定时不要传，工具会在全部可用库中检索。",
        `- \`limit\`：返回条数，可选，默认 ${KB_DEFAULT_LIMIT}，最大 ${KB_MAX_LIMIT}。`,
        "",
        "返回 JSON 数组，每项通常包含 kbId、kbName、chunkId、text、title、source、metadata 等字段。",
    ].join("\n");
}