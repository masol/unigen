import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export const SEARCH_CHUNK_SIZE = 800;
export const SEARCH_CHUNK_OVERLAP = 120;
export const CHUNK_SEARCH_CANDIDATE_MULTIPLIER = 3;

const CHUNK_META_KEY = "__searchChunk";

export interface SearchChunkMeta {
    parentId: string;
    index: number;
    total: number;
    fullText: string;
}

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: SEARCH_CHUNK_SIZE,
    chunkOverlap: SEARCH_CHUNK_OVERLAP,
    separators: ["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
});

export async function splitForSearch(text: string): Promise<string[]> {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= SEARCH_CHUNK_SIZE) return [trimmed];

    const chunks = await splitter.splitText(trimmed);
    return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

export function withChunkMeta(
    metadata: Record<string, unknown> | undefined,
    meta: SearchChunkMeta,
): string {
    return JSON.stringify({
        ...(metadata ?? {}),
        [CHUNK_META_KEY]: meta,
    });
}

export function readChunkMeta(metadata: unknown): SearchChunkMeta | null {
    if (typeof metadata !== "string" || !metadata) return null;

    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        const raw = parsed[CHUNK_META_KEY] as
            | Partial<SearchChunkMeta>
            | undefined;

        if (
            !raw ||
            typeof raw.parentId !== "string" ||
            typeof raw.index !== "number" ||
            typeof raw.total !== "number" ||
            typeof raw.fullText !== "string"
        ) {
            return null;
        }

        return {
            parentId: raw.parentId,
            index: raw.index,
            total: raw.total,
            fullText: raw.fullText,
        };
    } catch {
        return null;
    }
}

export function stripChunkMeta(metadata: unknown): string {
    if (typeof metadata !== "string" || !metadata) return "{}";

    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        delete parsed[CHUNK_META_KEY];
        return JSON.stringify(parsed);
    } catch {
        return metadata;
    }
}