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

/**
 * Embedding 运行状态：
 * - disabled：未配置 embed_model，FTS 正常工作
 * - ready：模型已加载，向量检索可用
 * - degraded：配置了但加载/调用失败，已临时禁用，检索退化为 FTS
 */
export type EmbeddingStatus = "disabled" | "ready" | "degraded";

export interface EmbeddingFailure {
    /** 触发失败的模型 key；解析失败时为原始配置值，未配置时为空串 */
    modelKey: string;
    message: string;
    at: string;
    cause?: unknown;
}

export interface EmbedSwitchPayload {
    previous: EmbeddingState | null;
    current: EmbeddingState;
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
    #loading: Promise<EmbeddingState | null> | null = null;
    #store = createEmbeddingStateStore();

    /** 最近一次从配置解析出的 modelKey，用于失败时回溯来源 */
    #configuredModelKey: string | null = null;

    /** 配置了但加载/调用失败的信息；非空即表示临时禁用 */
    #failure: EmbeddingFailure | null = null;

    get ready(): boolean {
        return !!this.#op && !!this.#state;
    }

    get state(): EmbeddingState | null {
        return this.#state;
    }

    /** 后续代码应优先使用 status / degraded 判断是否降级 */
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

    /**
     * 标记当前 Embedding 为临时禁用（等同于未配置 embed_model）。
     *
     * - 清空 op/state，ready 变为 false
     * - 记录 failure，status 变为 degraded
     * - 下一次 ensureReady() 会按配置重新尝试加载（自愈）
     */
    invalidate(error?: unknown): void {
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

    async ensureReady(): Promise<EmbeddingState | null> {
        const raw = String(configService().get("embed_model") ?? "").trim();
        if (!raw) {
            // 用户主动关闭：这是 disabled，不是 degraded
            this.#op = null;
            this.#state = null;
            this.#configuredModelKey = null;
            this.#failure = null;
            return null;
        }

        const parsed = parseEmbedModel(raw);
        if (!parsed) {
            this.#configuredModelKey = raw;
            throwPrecondition(`[Search] 非法 embed_model 配置: "${raw}"`);
        }

        this.#configuredModelKey = parsed.modelKey;

        if (this.#op && this.#state?.modelKey === parsed.modelKey) {
            return this.#state;
        }

        if (this.#loading) {
            return this.#loading;
        }

        this.#loading = this.#load(parsed);
        try {
            return await this.#loading;
        } finally {
            this.#loading = null;
        }
    }

    async doEmbedding(
        batch: string[],
        type: EmbedType,
    ): Promise<number[][]> {
        try {
            await this.ensureReady();
        } catch (error) {
            // 配置非法 / 加载失败：标记 degraded，调用方可据此降级到 FTS
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
            // 运行时失败（服务不可用、网络等）：临时禁用，后续检索走 FTS
            this.invalidate(error);
            throw error;
        }
    }

    async #load(parsed: ParsedEmbedModel): Promise<EmbeddingState> {
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

        this.#op = op;
        this.#state = state;
        this.#failure = null; // 成功加载即解除降级

        return state;
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