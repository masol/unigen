// packages/main/src/libs/searchsrv/tables/skill-table.ts
// tables/skill-table.ts
import type { Schema } from "apache-arrow";
import {
    SKILL_BODY_META_KEY,
    SKILL_DIR_META_KEY,
} from "../metadata-keys.js";
import { getSkillSchema, SKILL_TABLE } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import { scanSkillsFromDirectory } from "../skill-loader.js";
import type { SearchOptions, SearchRow } from "../types.js";

export interface SkillInput {
    id: string;
    name: string;
    description: string;
    path: string;
    /**
     * skill 目录相对于扫描根的路径。
     * 只作为 meta 返回，不参与 embedding/FTS。
     */
    dir?: string;
    /** skill 正文；不进入检索索引，仅用于命中后返回完整条目 */
    text?: string;
    metadata?: Record<string, unknown>;
}

export interface SkillRow extends Record<string, unknown> {
    id: string;
    name: string;
    description: string;
    path: string;
    /** 索引时为 name + description；返回给调用方时还原为正文（若有） */
    text: string;
    vector?: number[];
    metadata?: string;
    /** 检索时若启用 Rerank，会附带精排分数；未启用时不存在。 */
    rerankScore?: number;
    created_at?: string;
    updated_at?: string;
}

export interface SkillSearchOptions extends SearchOptions {
    offset?: number;
}

export class SkillTable extends SearchTableBase<SkillRow> {
    constructor(host: SearchDbBase, name = SKILL_TABLE) {
        super(host, name);
    }

    protected schema(vecSize: number): Schema {
        return getSkillSchema(vecSize);
    }

    protected ftsColumns(): string[] {
        // 只检索 name 和 description；正文不进入 FTS
        return ["name", "description"];
    }

    private toRecord(item: SkillInput): SearchRow {
        const now = new Date().toISOString();
        const searchable = [item.name, item.description]
            .filter((part) => part.trim().length > 0)
            .join("\n");

        return {
            id: item.id,
            name: item.name,
            description: item.description,
            path: item.path,
            text: searchable,
            metadata: JSON.stringify({
                ...(item.metadata ?? {}),
                ...(item.dir !== undefined
                    ? { [SKILL_DIR_META_KEY]: item.dir }
                    : {}),
                ...(item.text?.trim()
                    ? { [SKILL_BODY_META_KEY]: item.text.trim() }
                    : {}),
            }),
            created_at: now,
            updated_at: now,
        };
    }

    async syncSkills(items: SkillInput[]): Promise<void> {
        await this.replaceAll(items.map((item) => this.toRecord(item)));
    }

    /**
     * 单条新增 skill。用于安装流程：解析出 SkillInput 后直接写入，
     * 不触发全量重建，也不影响其它已存在的 skill。
     *
     * 不会去重：调用方需保证 id 唯一，或先调用 deleteSkill 清理旧条目。
     */
    async addSkill(item: SkillInput): Promise<void> {
        await this.add([this.toRecord(item)]);
    }

    /**
     * 按 id 删除 skill。不存在的 id 静默忽略。
     *
     * 只移除检索库中的条目，不处理磁盘文件；磁盘清理由 loader 层负责。
     */
    async deleteSkill(id: string): Promise<void> {
        const trimmed = id.trim();
        if (!trimmed) return;

        const escaped = trimmed.replace(/'/g, "''");
        await this.ensureTable().delete(`id = '${escaped}'`);
    }

    /**
     * 统一初始化入口：扫描目录下所有 SKILL.md，解析 front-matter 并全量同步。
     *
     * 注意：这是 replaceAll 语义。若需要合并多个技能根，请先合并 items，
     * 再调用 syncSkills，避免多次调用互相覆盖。
     */
    async syncSkillsFromDirectory(rootDir: string): Promise<void> {
        const skills = await scanSkillsFromDirectory(rootDir);

        await this.syncSkills(
            skills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                description: skill.description,
                path: skill.path,
                dir: skill.dir,
                text: skill.text,
                metadata: skill.metadata,
            })),
        );
    }

    /**
     * 按 id 获取完整 skill 条目。
     *
     * 返回前会从 metadata 中还原正文，并剥离 __skillBody，
     * 调用方无需再解析 metadata。
     */
    async getById(id: string): Promise<SkillRow | null> {
        const row = await this.findById(id);
        return row ? this.toSkillRow(row) : null;
    }

    /**
     * 枚举全部 skill，支持分页；不依赖 query（无 FTS / 向量）。
     *
     * 与 ToolTable.listTools 一样，只 select 必要字段，不读取 vector。
     * 返回前会还原 skill 正文并剥离 __skillBody。
     */
    async listSkills(
        opts: { limit?: number; offset?: number } = {},
    ): Promise<SkillRow[]> {
        const limit = opts.limit ?? 100;
        const offset = opts.offset ?? 0;
        if (limit <= 0 || offset < 0) return [];

        const rows = (await this.ensureTable()
            .query()
            .select([
                "id",
                "name",
                "description",
                "path",
                "text",
                "metadata",
            ])
            .limit(offset + limit)
            .toArray()) as SkillRow[];

        return rows.slice(offset).map((row) => this.toSkillRow(row));
    }

    /**
     * skill 检索返回完整条目。
     *
     * 索引和召回阶段仅使用 name + description；正文不参与 embedding/FTS。
     * 命中后从 metadata 中还原正文，使调用方拿到完整 skill。
     *
     * queryText 为空时枚举全部 skill，并支持 offset / limit 分页。
     * 非空检索时通过多取 offset + limit 行再切片实现分页。
     *
     * 这与 Anthropic Agent Skills 的渐进式披露一致：描述决定“是否加载”，
     * 正文只在命中后才进入上下文。
     */
    async searchSkills(
        queryText: string,
        opts: SkillSearchOptions = {},
    ): Promise<SkillRow[]> {
        const { offset = 0, limit = 10, ...rest } = opts;
        if (limit <= 0 || offset < 0) return [];

        if (!queryText.trim()) {
            return this.listSkills({ limit, offset });
        }

        const rows = await super.search(queryText, {
            mode: "hybrid",
            ...rest,
            limit: offset + limit,
        });

        return rows
            .slice(offset, offset + limit)
            .map((row) => this.toSkillRow(row));
    }

    private toSkillRow(row: SkillRow): SkillRow {
        const body = readBody(row.metadata);
        return {
            ...row,
            text: body ?? row.text,
            metadata: stripBody(row.metadata),
        };
    }
}

function readBody(metadata: unknown): string | null {
    if (typeof metadata !== "string" || !metadata) return null;
    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        const body = parsed[SKILL_BODY_META_KEY];
        return typeof body === "string" && body.length > 0 ? body : null;
    } catch {
        return null;
    }
}

function stripBody(metadata: unknown): string {
    if (typeof metadata !== "string" || !metadata) return "{}";
    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        delete parsed[SKILL_BODY_META_KEY];
        return JSON.stringify(parsed);
    } catch {
        return metadata;
    }
}