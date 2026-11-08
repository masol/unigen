import { createEmbeding } from "$libs/model/factory/embed.js";
import type { EmbedingOp, EmbedType } from "$libs/model/factory/type.js";
import { configService } from "$libs/store/index.js";
import type { Provider } from "$types/index.js";
import Logger from "electron-log/main.js";
import { throwPrecondition } from "../../utils/err.js";
import {
    createEmbeddingStateStore,
    type EmbeddingState,
} from "./embed-state-store.js";

export type { EmbeddingState } from "./embed-state-store.js";

export type EmbeddingStatus = "disabled" | "ready" | "degraded";

export interface EmbeddingFailure {
    modelKey: string;
    message: string;
    at: string;
    cause?: unknown;
}

export interface EmbedSwitchPayload {
    previous: EmbeddingState | null;
    current: EmbeddingState | null;
}

export interface EmbeddingChange {
    changed: boolean;
    previous: EmbeddingState | null;
    current: EmbeddingState | null;
}

export interface ParsedEmbedModel {
    modelKey: string;
    modelId: string;
    providerId?: string;
}

type ResolvedConfig =
    | { kind: "disabled" }
    | { kind: "invalid"; raw: string }
    | { kind: "ready"; parsed: ParsedEmbedModel };

export function parseEmbedModel(raw: string): ParsedEmbedModel | null {
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

export class EmbeddingManager {
    #op: EmbedingOp | null = null;
    #state: EmbeddingState | null = null;
    #loading: Promise<{ op: EmbedingOp; state: EmbeddingState }> | null = null;
    #loadingModelKey: string | null = null;
    #store = createEmbeddingStateStore();
    #generation = 0;
    #configuredModelKey: string | null = null;
    #failure: EmbeddingFailure | null = null;

    get ready(): boolean {
        return !!this.#op && !!this.#state;
    }

    get state(): EmbeddingState | null {
        return this.#state;
    }

    get status(): EmbeddingStatus {
        if (this.ready) return "ready";
        if (this.#failure) return "degraded";
        return "disabled";
    }

    get degraded(): boolean {
        return this.status === "degraded";
    }

    get failure(): EmbeddingFailure | null {
        return this.#failure;
    }

    get embedSize(): number {
        if (!this.#state || this.#state.dimension <= 0) {
            throwPrecondition("[Search] 向量模型未就绪，无法获取向量维度。");
        }
        return this.#state.dimension;
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
                ? `[Search] Embedding 模型 [${modelKey}] 已临时禁用，检索退化为全文检索。`
                : "[Search] Embedding 已临时禁用，检索退化为全文检索。",
            error ?? "",
        );
    }

    async loadAppliedState(): Promise<EmbeddingState | null> {
        const state = await this.#store.load();
        return state.modelKey ? state : null;
    }

    async markApplied(): Promise<void> {
        if (!this.#state) return;

        await this.#store.save({
            ...this.#state,
            updatedAt: new Date().toISOString(),
        });
    }

    async clearApplied(): Promise<void> {
        await this.#store.save({
            modelKey: "",
            dimension: 0,
            updatedAt: new Date().toISOString(),
        });
    }

    async ensureReady(): Promise<EmbeddingState | null> {
        for (; ;) {
            const config = this.#resolveConfig();

            if (config.kind === "disabled") {
                this.#resetDisabled();
                return null;
            }

            if (config.kind === "invalid") {
                this.#generation++;
                this.#configuredModelKey = config.raw;
                throwPrecondition(
                    `[Search] 非法 embed_model 配置: "${config.raw}"`,
                );
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

    async doEmbedding(
        batch: string[],
        type: EmbedType,
    ): Promise<number[][]> {
        try {
            await this.ensureReady();
        } catch (error) {
            this.invalidate(error);
            throw error;
        }

        if (!this.ready || !this.#op) {
            throwPrecondition("[Search] Embedding 未配置或未就绪。");
        }
        if (batch.length === 0) return [];

        try {
            const result = await this.#op.embedMany(batch, type);
            const vectors = result.embeddings;

            if (!Array.isArray(vectors) || vectors.length !== batch.length) {
                throwPrecondition(
                    "[Search] Embedding 返回数量与输入不一致。",
                );
            }
            return vectors;
        } catch (error) {
            this.invalidate(error);
            throw error;
        }
    }

    #resolveConfig(): ResolvedConfig {
        const raw = String(
            configService().get("embed_model") ?? "",
        ).trim();

        if (!raw) return { kind: "disabled" };

        const parsed = parseEmbedModel(raw);
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
        parsed: ParsedEmbedModel,
    ): Promise<{ op: EmbedingOp; state: EmbeddingState }> {
        let provider: Provider | undefined;

        if (parsed.providerId) {
            provider = await configService().getProvider(parsed.providerId);
            if (!provider) {
                throwPrecondition(
                    `[Search] 未找到 Embedding Provider: "${parsed.providerId}"。`,
                );
            }
        }

        const op = await createEmbeding(parsed.modelId, provider);
        const dimension = await this.#probeDimension(op);

        const state: EmbeddingState = {
            modelKey: parsed.modelKey,
            dimension,
            updatedAt: new Date().toISOString(),
        };

        return { op, state };
    }

    async #probeDimension(op: EmbedingOp): Promise<number> {
        const result = await op.embedMany(["dimension-probe"], "document");
        const [probe] = result.embeddings;

        if (!probe || probe.length <= 0) {
            throwPrecondition("[Search] 无法探测 Embedding 维度。");
        }
        return probe.length;
    }
}