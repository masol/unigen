import { appLife } from "$libs/utils/tapable/applife.js";
import Logger from "electron-log/main.js";
import type {
    EmbeddingFailure,
    EmbeddingState,
    EmbeddingStatus,
    EmbedSwitchPayload,
} from "./embedding/embedding-manager.js";
import { GlobalSearchDB } from "./global-search-db.js";

const GLOBAL_EMBEDDING_SERVICE_KEY = Symbol.for(
    "unigen.singleton.globalEmbeddingService",
);

export class GlobalEmbeddingService {
    static get instance(): GlobalEmbeddingService {
        return getGlobalEmbeddingService();
    }

    onSwitched: (state: EmbeddingState) => void | Promise<void> = () => { };

    onError: (error: unknown) => void = () => { };

    get switching(): boolean {
        return GlobalSearchDB.instance.rebuilding;
    }

    get state(): EmbeddingState | null {
        return GlobalSearchDB.instance.embeddingState;
    }

    /** disabled / ready / degraded */
    get status(): EmbeddingStatus {
        return GlobalSearchDB.instance.embeddingStatus;
    }

    /** 是否因加载/调用失败而临时禁用了 Embedding */
    get degraded(): boolean {
        return GlobalSearchDB.instance.embeddingDegraded;
    }

    get failure(): EmbeddingFailure | null {
        return GlobalSearchDB.instance.embeddingFailure;
    }

    async open(): Promise<void> {
        try {
            const db = GlobalSearchDB.instance;
            await db.open();

            const state = db.embeddingState;
            if (state) {
                await this.onSwitched(state);
                await this.#notifyProjects(null, state);
            } else if (db.embeddingDegraded) {
                Logger.warn(
                    "[Search] Embedding 已临时禁用，检索退化为全文检索。",
                    db.embeddingFailure,
                );
            }
        } catch (error) {
            this.onError(error);
            throw error;
        }
    }

    async refresh(): Promise<void> {
        try {
            const db = GlobalSearchDB.instance;
            const previous = db.embeddingState;
            await db.refreshEmbedding();

            const state = db.embeddingState;
            if (state) {
                await this.onSwitched(state);
                await this.#notifyProjects(previous, state);
            } else if (db.embeddingDegraded) {
                Logger.warn(
                    "[Search] Embedding 加载失败，已临时禁用，检索退化为全文检索。",
                    db.embeddingFailure,
                );
            } else {
                Logger.warn(
                    "[Search] 当前未配置 embed_model，向量检索不可用；FTS 仍可工作。",
                );
            }
        } catch (error) {
            this.onError(error);
            throw error;
        }
    }

    async #notifyProjects(
        previous: EmbeddingState | null,
        current: EmbeddingState,
    ): Promise<void> {
        const payload: EmbedSwitchPayload = { previous, current };
        await appLife.onEmbedSwitch.promise(payload);
    }
}

export function getGlobalEmbeddingService(): GlobalEmbeddingService {
    const g = globalThis as unknown as Record<
        symbol,
        GlobalEmbeddingService | undefined
    >;

    return (g[GLOBAL_EMBEDDING_SERVICE_KEY] ??=
        new GlobalEmbeddingService());
}