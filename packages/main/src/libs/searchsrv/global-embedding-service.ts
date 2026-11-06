import { configService } from "$libs/store/index.js";
import evtbus from "$libs/utils/evtbus.js";
import { appLife } from "$libs/utils/tapable/applife.js";
import Logger from "electron-log/main.js";
import {
    parseEmbedModel,
    type EmbeddingFailure,
    type EmbeddingState,
    type EmbeddingStatus,
    type EmbedSwitchPayload,
} from "./embedding/embedding-manager.js";
import { GlobalSearchDB } from "./global-search-db.js";

const GLOBAL_EMBEDDING_SERVICE_KEY = Symbol.for(
    "unigen.singleton.globalEmbeddingService",
);

function readConfiguredEmbedModelKey(): string {
    const raw = String(configService().get("embed_model") ?? "").trim();
    if (!raw) return "";
    return parseEmbedModel(raw)?.modelKey ?? raw;
}

export class GlobalEmbeddingService {
    static get instance(): GlobalEmbeddingService {
        return getGlobalEmbeddingService();
    }

    #refreshing: Promise<void> | null = null;

    constructor() {
        evtbus.on("embed-changed", () => {
            void this.#handleEmbedChanged();
        });
    }

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

    async #handleEmbedChanged(): Promise<void> {
        while (this.#refreshing) {
            await this.#refreshing.catch(() => undefined);
        }

        const configured = readConfiguredEmbedModelKey();
        const current =
            this.state?.modelKey ??
            this.failure?.modelKey ??
            "";

        if (configured === current) {
            return;
        }

        this.#refreshing = this.#refresh();
        try {
            await this.#refreshing;
        } catch (error) {
            Logger.error("[Search] Embedding 刷新失败。", error);
        } finally {
            this.#refreshing = null;
        }
    }

    async #refresh(): Promise<void> {
        const db = GlobalSearchDB.instance;
        const previous = db.embeddingState;
        await db.refreshEmbedding();

        const state = db.embeddingState;
        if (state) {
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