import type { Schema } from "apache-arrow";
import { getToolSchema, TOOL_TABLE } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import type { SearchOptions } from "../types.js";

export interface ToolInput {
    id: string;
    name: string;
    description: string;
    text?: string;
    metadata?: Record<string, unknown>;
}

export interface ToolRow extends Record<string, unknown> {
    id: string;
    name: string;
    description: string;
    text: string;
    vector?: number[];
    metadata?: string;
    created_at?: string;
    updated_at?: string;
}

export class ToolTable extends SearchTableBase<ToolRow> {
    constructor(host: SearchDbBase, name = TOOL_TABLE) {
        super(host, name);
    }

    protected schema(vecSize: number): Schema {
        return getToolSchema(vecSize);
    }

    protected ftsColumns(): string[] {
        return ["name", "description", "text"];
    }

    async syncTools(items: ToolInput[]): Promise<void> {
        const now = new Date().toISOString();
        await this.replaceAll(
            items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                text: item.text ?? `${item.name}\n${item.description}`,
                metadata: JSON.stringify(item.metadata ?? {}),
                created_at: now,
                updated_at: now,
            })),
        );
    }

    /**
     * tool 默认混合搜索：name/description/text 参与 FTS。
     *
     * name 权重提升依赖 LanceDB FTS boost 能力；当前 API 不确定，
     * 因此这里不硬编码权重。
     */
    async searchTools(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<ToolRow[]> {
        return this.search(queryText, {
            mode: "hybrid",
            ...opts,
        });
    }
}