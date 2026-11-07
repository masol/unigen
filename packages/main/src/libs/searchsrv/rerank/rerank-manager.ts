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
    /** 触发失败的模型 key；解析失败时为原始配置值，未配置时为空串 */
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

    /**
     * 配置代际。每次配置变化 / 主动禁用 / 降级都会递增，
     * 用于丢弃“加载期间配置已变”的过期结果。
     */
    #generation = 0;

    /** 最近一次从配置解析出的 modelKey，用于失败时回溯来源 */
    #configuredModelKey: string | null = null;

    /** 配置了但加载/调用失败的信息；非空即表示临时禁用 */
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

    /**
     * 标记当前 Rerank 为临时禁用（等同于未配置 rerank_model）。
     *
     * - 递增 generation，使进行中的加载结果过期
     * - 清空 op/state，ready 变为 false
     * - 记录 failure，status 变为 degraded
     * - 下一次 ensureReady() 会按配置重新尝试加载（自愈）
     */
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

    /**
     * 确保当前配置的 Rerank 已就绪。
     *
     * 通过 generation + 共享 loading 处理“加载进行中配置又变了”的竞态：
     * - 加载完成后 generation 不匹配：丢弃结果，按最新配置重新加载
     * - 并发调用共享同一个 loading；若配置已变，等待结束后重新评估
     * - 配置被清空/非法时递增 generation，使进行中的加载结果过期
     */
    async ensureReady(): Promise<RerankState | null> {
        for (; ;) {
            const raw = String(
                configService().get("rerank_model") ?? "",
            ).trim();

            if (!raw) {
                // 用户主动关闭：这是 disabled，不是 degraded
                this.#generation++;
                this.#op = null;
                this.#state = null;
                this.#configuredModelKey = null;
                this.#failure = null;
                return null;
            }

            const parsed = parseRerankModel(raw);
            if (!parsed) {
                this.#generation++;
                this.#configuredModelKey = raw;

                const error = new Error(
                    `[Search] 非法 rerank_model 配置: "${raw}"`,
                );
                this.invalidate(error);
                throw error;
            }

            this.#configuredModelKey = parsed.modelKey;

            if (this.#op && this.#state?.modelKey === parsed.modelKey) {
                return this.#state;
            }

            if (this.#loading) {
                try {
                    await this.#loading;
                } catch (error) {
                    // 共享加载失败：配置未变时直接抛出，避免重复加载
                    if (this.#configuredModelKey === parsed.modelKey) {
                        throw error;
                    }
                }
                // 加载结束或配置已变：重新评估当前配置
                continue;
            }

            const generation = ++this.#generation;
            const loading = this.#load(parsed);
            this.#loading = loading;

            try {
                const { op, state } = await loading;

                if (this.#generation !== generation) {
                    // 加载期间配置已变，丢弃本次结果
                    continue;
                }

                this.#op = op;
                this.#state = state;
                this.#failure = null; // 成功加载即解除降级
                return state;
            } catch (error) {
                if (this.#generation !== generation) {
                    // 过期加载失败：忽略，按当前配置重新加载
                    continue;
                }
                throw error;
            } finally {
                if (this.#loading === loading) {
                    this.#loading = null;
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
            // 运行时失败（服务不可用、网络、本地模型异常等）：临时禁用
            this.invalidate(error);
            throw error;
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