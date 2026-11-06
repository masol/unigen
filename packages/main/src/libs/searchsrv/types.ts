export type SearchMode = "vector" | "fts" | "hybrid";

export interface SearchOptions {
    mode?: SearchMode;
    limit?: number;
    ftsColumn?: string;
    filter?: string;
    select?: string[];
}

export type SearchRow = Record<string, unknown> & { text: string };