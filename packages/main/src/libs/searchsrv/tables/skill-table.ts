// tables/skill-table.ts
import type { Schema } from "apache-arrow";
import { getSkillSchema, SKILL_TABLE } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import { scanSkillsFromDirectory } from "../skill-loader.js";
import type { SearchOptions } from "../types.js";

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
    created_at?: string;
    updated_at?: string;
}

const BODY_META_KEY = "__skillBody";
const DIR_META_KEY = "skillDir";

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

    async syncSkills(items: SkillInput[]): Promise<void> {
        const now = new Date().toISOString();
        await this.replaceAll(
            items.map((item) => {
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
                            ? { [DIR_META_KEY]: item.dir }
                            : {}),
                        ...(item.text?.trim()
                            ? { [BODY_META_KEY]: item.text.trim() }
                            : {}),
                    }),
                    created_at: now,
                    updated_at: now,
                };
            }),
        );
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
     * skill 检索返回完整条目。
     *
     * 索引和召回阶段仅使用 name + description；正文不参与 embedding/FTS。
     * 命中后从 metadata 中还原正文，使调用方拿到完整 skill。
     *
     * 这与 Anthropic Agent Skills 的渐进式披露一致：描述决定“是否加载”，
     * 正文只在命中后才进入上下文。
     */
    async searchSkills(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<SkillRow[]> {
        const rows = await super.search(queryText, {
            mode: "hybrid",
            ...opts,
        });

        return rows.map((row) => {
            const body = readBody(row.metadata);
            return {
                ...row,
                text: body ?? row.text,
                metadata: stripBody(row.metadata),
            };
        });
    }
}

function readBody(metadata: unknown): string | null {
    if (typeof metadata !== "string" || !metadata) return null;
    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        const body = parsed[BODY_META_KEY];
        return typeof body === "string" && body.length > 0 ? body : null;
    } catch {
        return null;
    }
}

function stripBody(metadata: unknown): string {
    if (typeof metadata !== "string" || !metadata) return "{}";
    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        delete parsed[BODY_META_KEY];
        return JSON.stringify(parsed);
    } catch {
        return metadata;
    }
}