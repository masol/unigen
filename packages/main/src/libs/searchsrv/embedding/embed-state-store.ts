import { lanceGlobalDir } from "$libs/utils/sys/dir.js";
import { JsonFileStore } from "../json-store.js";

export interface EmbeddingState {
    modelKey: string;
    dimension: number;
    updatedAt: string;
}

const FALLBACK: EmbeddingState = {
    modelKey: "",
    dimension: 0,
    updatedAt: "",
};

export function createEmbeddingStateStore(): JsonFileStore<EmbeddingState> {
    return new JsonFileStore<EmbeddingState>(
        lanceGlobalDir("embed-state.json"),
        FALLBACK,
    );
}