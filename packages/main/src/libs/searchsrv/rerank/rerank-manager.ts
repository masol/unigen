import { createRerank } from "$libs/model/factory/rerank.js";
import type {
    RerankOp,
    RerankOptions,
    RerankResultLike,
} from "$libs/model/factory/type.js";
import { configService } from "$libs/store/index.js";
import type { Provider } from "$types/index.js";
import Logger from "electron-log/main.js";
import { throwPrecondition } from "../../utils/err.js";

export type RerankStatus = "disabled" | "ready" | "degraded";

export interface RerankState {
    modelKey: string;
    updatedAt: string;
}

export interface RerankFailure {
    modelKey: string;
    message: string;
    at: string;
    cause?: unknown;
}

export interface ParsedRerankModel {
    modelKey: string;
    modelId: string;
    providerId?: string;
}

type ResolvedConfig =
    | { kind: "disabled" }
    | { kind: "invalid"; raw: string }
    | { kind: "ready"; parsed: ParsedRerankModel };

export function parseRerankModel(raw: string): ParsedRerankModel | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const matched = /^::([^:]+)::(.+)$/.exec(trimmed);
    if (matched) {
        const providerId = matched[1].trim();
        const modelId = matched[2].trim();
        if (!providerId || !modelId) return null;

        return {
            modelKey: `${providerId}::${modelId}`,
            modelId,
            providerId,
        };
    }

    return {
        modelKey: trimmed,
        modelId: trimmed,
    };
}

export class RerankManager {
    #op: RerankOp | null = null;
    #state: RerankState | null = null;
    #loading: Promise<{ op: RerankOp; state: RerankState }> | null = null;
    #loadingModelKey: string | null = null;
    #generation = 0;
    #configuredModelKey: string | null = null;
    #failure: RerankFailure | null = null;

    get ready(): boolean {
        return !!this.#op && !!this.#state;
    }

    get state(): RerankState | null {
        return this.#state;
    }

    get status(): RerankStatus {
        if (this.ready) return "ready";
        if (this.#failure) return "degraded";
        return "disabled";
    }

    get degraded(): boolean {
        return this.status === "degraded";
    }

    get failure(): RerankFailure | null {
        return this.#failure;
    }

    invalidate(error?: unknown): void {
        this.#generation++;

        const modelKey =
            this.#state?.modelKey ??
            this.#configuredModelKey ??
            "";

        this.#op = null;
        this.#state = null;
        this.#failure = {
            modelKey,
            message:
                error instanceof Error
                    ? error.message
                    : String(error ?? ""),
            at: new Date().toISOString(),
            cause: error,
        };

        Logger.warn(
            modelKey
                ? `[Search] Rerank 模型 [${modelKey}] 已临时禁用。`
                : "[Search] Rerank 已临时禁用。",
            error ?? "",
        );
    }

    async ensureReady(): Promise<RerankState | null> {
        for (; ;) {
            const config = this.#resolveConfig();

            if (config.kind === "disabled") {
                this.#resetDisabled();
                return null;
            }

            if (config.kind === "invalid") {
                this.#generation++;
                this.#configuredModelKey = config.raw;
                const error = new Error(
                    `[Search] 非法 rerank_model 配置: "${config.raw}"`,
                );
                this.invalidate(error);
                throw error;
            }

            const { parsed } = config;
            this.#configuredModelKey = parsed.modelKey;

            if (this.#op && this.#state?.modelKey === parsed.modelKey) {
                return this.#state;
            }

            if (this.#loading) {
                await this.#awaitSharedLoading(parsed.modelKey);
                continue;
            }

            const generation = ++this.#generation;
            const loading = this.#load(parsed);
            this.#loading = loading;
            this.#loadingModelKey = parsed.modelKey;

            try {
                const { op, state } = await loading;

                if (this.#generation !== generation) {
                    continue;
                }

                this.#op = op;
                this.#state = state;
                this.#failure = null;
                return state;
            } catch (error) {
                if (this.#generation !== generation) {
                    continue;
                }
                throw error;
            } finally {
                if (this.#loading === loading) {
                    this.#loading = null;
                    this.#loadingModelKey = null;
                }
            }
        }
    }

    async rerank(
        query: string,
        documents: string[],
        opts?: RerankOptions,
    ): Promise<RerankResultLike> {
        try {
            await this.ensureReady();
        } catch (error) {
            this.invalidate(error);
            throw error;
        }

        if (!this.ready || !this.#op) {
            throwPrecondition("[Search] Rerank 未配置或未就绪。");
        }

        if (documents.length === 0) {
            return {
                ranking: [],
                rerankedDocuments: [],
            };
        }

        try {
            return await this.#op.rerank(query, documents, opts);
        } catch (error) {
            this.invalidate(error);
            throw error;
        }
    }

    #resolveConfig(): ResolvedConfig {
        const raw = String(
            configService().get("rerank_model") ?? "",
        ).trim();

        if (!raw) return { kind: "disabled" };

        const parsed = parseRerankModel(raw);
        if (!parsed) return { kind: "invalid", raw };

        return { kind: "ready", parsed };
    }

    #resetDisabled(): void {
        this.#generation++;
        this.#op = null;
        this.#state = null;
        this.#configuredModelKey = null;
        this.#failure = null;
    }

    async #awaitSharedLoading(expectedModelKey: string): Promise<void> {
        const loadingModelKey = this.#loadingModelKey;
        try {
            await this.#loading;
        } catch (error) {
            if (loadingModelKey === expectedModelKey) {
                throw error;
            }
        }
    }

    async #load(
        parsed: ParsedRerankModel,
    ): Promise<{ op: RerankOp; state: RerankState }> {
        let provider: Provider | undefined;

        if (parsed.providerId) {
            provider = await configService().getProvider(parsed.providerId);
            if (!provider) {
                throwPrecondition(
                    `[Search] 未找到 Rerank Provider: "${parsed.providerId}"。`,
                );
            }
        }

        const op = await createRerank(parsed.modelId, provider);

        return {
            op,
            state: {
                modelKey: parsed.modelKey,
                updatedAt: new Date().toISOString(),
            },
        };
    }
}