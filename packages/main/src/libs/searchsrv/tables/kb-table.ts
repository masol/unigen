import type { Schema } from "apache-arrow";
import { getKbSchema } from "../schema.js";
import type { SearchDbBase } from "../search-db-base.js";
import { SearchTableBase } from "../search-table-base.js";
import type { SearchOptions } from "../types.js";

export interface KbChunkInput {
    id: string;
    text: string;
    title?: string;
    source?: string;
    metadata?: Record<string, unknown>;
}

export interface KbChunkRow extends Record<string, unknown> {
    id: string;
    text: string;
    title: string;
    source: string;
    vector?: number[];
    metadata?: string;
    created_at?: string;
    updated_at?: string;
}

export class KbTable extends SearchTableBase<KbChunkRow> {
    constructor(host: SearchDbBase, name: string) {
        super(host, name);
    }

    protected schema(vecSize: number): Schema {
        return getKbSchema(vecSize);
    }

    protected ftsColumns(): string[] {
        return ["title", "text"];
    }

    async addChunks(chunks: KbChunkInput[]): Promise<void> {
        const now = new Date().toISOString();
        await this.add(
            chunks.map((chunk) => ({
                id: chunk.id,
                text: chunk.text,
                title: chunk.title ?? "",
                source: chunk.source ?? "",
                metadata: JSON.stringify(chunk.metadata ?? {}),
                created_at: now,
                updated_at: now,
            })),
        );
    }

    async searchChunks(
        queryText: string,
        opts: SearchOptions = {},
    ): Promise<KbChunkRow[]> {
        return this.search(queryText, {
            mode: "hybrid",
            ...opts,
        });
    }
}