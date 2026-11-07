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
        // tool 没有正文，只检索 name 和 description
        return ["name", "description"];
    }

    async syncTools(items: ToolInput[]): Promise<void> {
        const now = new Date().toISOString();
        await this.replaceAll(
            items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                // text 是 schema 必填字段，仅作占位；FTS 不索引它
                text: [item.name, item.description]
                    .filter((part) => part.trim().length > 0)
                    .join("\n"),
                metadata: JSON.stringify(item.metadata ?? {}),
                created_at: now,
                updated_at: now,
            })),
        );
    }

    /**
     * tool 检索只依赖 name + description。
     * tool 没有正文，无需聚合；直接返回完整工具条目。
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