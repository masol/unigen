import type {
    RerankOptions,
    RerankResultLike,
} from "$libs/model/factory/type.js";
import { configService } from "$libs/store/index.js";
import evtbus from "$libs/utils/evtbus.js";
import Logger from "electron-log/main.js";
import {
    parseRerankModel,
    RerankManager,
    type RerankFailure,
    type RerankState,
    type RerankStatus,
} from "./rerank/rerank-manager.js";

const GLOBAL_RERANK_SERVICE_KEY = Symbol.for(
    "unigen.singleton.globalRerankService",
);

function readConfiguredRerankModelKey(): string {
    const raw = String(configService().get("rerank_model") ?? "").trim();
    if (!raw) return "";
    return parseRerankModel(raw)?.modelKey ?? raw;
}

export class GlobalRerankService {
    static get instance(): GlobalRerankService {
        return getGlobalRerankService();
    }

    #manager = new RerankManager();
    #refreshing: Promise<void> | null = null;

    constructor() {
        evtbus.on("rerank-changed", () => {
            void this.#handleRerankChanged();
        });
    }

    get switching(): boolean {
        return !!this.#refreshing;
    }

    get state(): RerankState | null {
        return this.#manager.state;
    }

    /** disabled / ready / degraded */
    get status(): RerankStatus {
        return this.#manager.status;
    }

    /** 是否因加载/调用失败而临时禁用了 Rerank */
    get degraded(): boolean {
        return this.#manager.degraded;
    }

    get failure(): RerankFailure | null {
        return this.#manager.failure;
    }

    /**
     * 当前是否已就绪。
     *
     * 注意：这是同步快照，不会触发加载。
     * 检索路径应使用 isEnabled()，它会按需加载并返回是否可用。
     */
    get enabled(): boolean {
        return this.#manager.ready;
    }

    /**
     * 确保 Rerank 按当前配置可用。
     * 未配置、配置非法、加载失败均返回 false，不向检索路径抛异常。
     */
    async isEnabled(): Promise<boolean> {
        try {
            return !!(await this.#manager.ensureReady());
        } catch (error) {
            Logger.warn(
                "[Search] Rerank 加载失败，已临时禁用。",
                error,
            );
            this.#manager.invalidate(error);
            return false;
        }
    }

    /**
     * 外部直接调用入口。
     * 未配置或降级时会抛错；检索内部会先通过 isEnabled() 判断并兜底。
     */
    async rerank(
        query: string,
        documents: string[],
        opts?: RerankOptions,
    ): Promise<RerankResultLike> {
        return this.#manager.rerank(query, documents, opts);
    }

    async refresh(): Promise<void> {
        try {
            await this.#manager.ensureReady();
        } catch (error) {
            this.#manager.invalidate(error);
            throw error;
        }
    }

    async #handleRerankChanged(): Promise<void> {
        while (this.#refreshing) {
            await this.#refreshing.catch(() => undefined);
        }

        const configured = readConfiguredRerankModelKey();
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
            Logger.error("[Search] Rerank 刷新失败。", error);
        } finally {
            this.#refreshing = null;
        }
    }

    async #refresh(): Promise<void> {
        try {
            const state = await this.#manager.ensureReady();

            if (state) {
                Logger.info(
                    `[Search] Rerank 已就绪: ${state.modelKey}`,
                );
                return;
            }

            Logger.info(
                "[Search] 当前未配置 rerank_model，Rerank 不可用。",
            );
        } catch (error) {
            this.#manager.invalidate(error);
            throw error;
        }
    }
}

export function getGlobalRerankService(): GlobalRerankService {
    const g = globalThis as unknown as Record<
        symbol,
        GlobalRerankService | undefined
    >;

    return (g[GLOBAL_RERANK_SERVICE_KEY] ??=
        new GlobalRerankService());
}