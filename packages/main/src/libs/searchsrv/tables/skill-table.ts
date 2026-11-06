import type { Schema } from "apache-arrow";
import { getSkillSchema, SKILL_TABLE } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import type { SearchOptions } from "../types.js";

export interface SkillInput {
    id: string;
    name: string;
    description: string;
    path: string;
    text?: string;
    metadata?: Record<string, unknown>;
}

export interface SkillRow extends Record<string, unknown> {
    id: string;
    name: string;
    description: string;
    path: string;
    text: string;
    vector?: number[];
    metadata?: string;
    created_at?: string;
    updated_at?: string;
}

export class SkillTable extends SearchTableBase<SkillRow> {
    constructor(host: SearchDbBase, name = SKILL_TABLE) {
        super(host, name);
    }

    protected schema(vecSize: number): Schema {
        return getSkillSchema(vecSize);
    }

    protected ftsColumns(): string[] {
        return ["name", "description", "text"];
    }

    async syncSkills(items: SkillInput[]): Promise<void> {
        const now = new Date().toISOString();
        await this.replaceAll(
            items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                path: item.path,
                text: item.text ?? `${item.name}\n${item.description}`,
                metadata: JSON.stringify(item.metadata ?? {}),
                created_at: now,
                updated_at: now,
            })),
        );
    }

    /**
     * skill 默认混合搜索：name/description/text 参与 FTS。
     *
     * name 权重提升依赖 LanceDB FTS boost 能力；当前 API 不确定，
     * 因此这里不硬编码权重。
     */
    async searchSkills(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<SkillRow[]> {
        return this.search(queryText, {
            mode: "hybrid",
            ...opts,
        });
    }
}