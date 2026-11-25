import { appLife } from "$libs/utils/tapable/applife.js";
import Logger from "electron-log/main.js";
import {
    type EmbeddingFailure,
    type EmbeddingState,
    type EmbeddingStatus,
    type EmbedSwitchPayload,
} from "./embedding/embedding-manager.js";
import { GlobalSearchDB } from "./global-search-db.js";

const GLOBAL_EMBEDDING_SERVICE_KEY = Symbol.for(
    "unigen.singleton.globalEmbeddingService",
);

export class GlobalEmbeddingService {
    static get instance(): GlobalEmbeddingService {
        return getGlobalEmbeddingService();
    }

    #refreshing: Promise<void> | null = null;

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
        const db = GlobalSearchDB.instance;
        await db.open();

        const state = db.embeddingState;
        if (state) {
            await this.#notifyProjects(null, state);
        } else if (db.embeddingDegraded) {
            Logger.warn(
                "[Search] Embedding 已临时禁用，检索退化为全文检索。",
                db.embeddingFailure,
            );
        }
    }

    /**
     * 显式刷新入口。
     *
     * 客户端契约：先通过配置接口写入 embed_model，再调用本方法。
     * 同一时刻的并发刷新会合并为同一次刷新；本次刷新结束后才返回。
     */
    async refresh(): Promise<void> {
        if (!this.#refreshing) {
            this.#refreshing = this.#refreshInternal().finally(() => {
                this.#refreshing = null;
            });
        }

        await this.#refreshing;
    }

    async #refreshInternal(): Promise<void> {
        const db = GlobalSearchDB.instance;
        const previous = db.embeddingState;

        await db.refreshEmbedding();

        const state = db.embeddingState;
        if (state) {
            await this.#notifyProjects(previous, state);
            return;
        }

        if (db.embeddingDegraded) {
            const message =
                db.embeddingFailure?.message ??
                "Embedding 加载失败，已临时禁用。";

            Logger.warn(
                "[Search] Embedding 加载失败，已临时禁用，检索退化为全文检索。",
                db.embeddingFailure,
            );

            // 从可用/失败态变为不可用时需要通知项目级检索库。
            await this.#notifyProjects(previous, null);

            throw new Error(`[Search] ${message}`);
        }

        Logger.warn(
            "[Search] 当前未配置 embed_model，向量检索不可用；FTS 仍可工作。",
        );

        if (previous) {
            await this.#notifyProjects(previous, null);
        }
    }

    async #notifyProjects(
        previous: EmbeddingState | null,
        current: EmbeddingState | null,
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