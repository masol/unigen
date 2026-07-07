import { IRunnerContext } from '$types/blueprint/context.js';
import { ModelTags } from '$types/shared/model.js';
import {
    LanguageModelV4,
    LanguageModelV4CallOptions,
    LanguageModelV4Middleware,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { createModel } from '../index.js';
import { selectCandidates, SortStrategy, type Candidate } from './candidate.js';
import { getLimiter, syncAndGetProviders } from './pool-registry.js';
import { DEFAULT_HOLD_TIMEOUT_MS } from './provider-pool.js';

export interface GetSmartModelOptions {
    requiredAbilities?: ModelTags[];
    preferVersion?: ModelTags;
    minScore?: number;

    /** 用正则匹配 modelId(能力筛选之后再过滤) */
    modelPattern?: RegExp;

    /** 精确指定 providerId + modelId,不 fallback,只占用并发通道 */
    exact?: { providerId: string; modelId: string };

    /**
     * 流式/长任务 slot 兜底超时(毫秒)。默认 30 分钟。
     * 未来视频等长任务可调大。
     */
    streamHoldTimeoutMs?: number;
    /**
     * 候选排序策略,决定 fallback 尝试顺序(第 0 个为首选)。
     * 默认 VersionDesc:最强模型优先。
     */
    sort?: SortStrategy;
}

// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// function isRetryable(error: any): boolean {
//     const status = error?.statusCode ?? error?.status;
//     return status === 429 || status === 500 || status === 502 || status === 503;
// }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAbortError(error: any): boolean {
    return (
        error?.name === 'AbortError' ||
        error?.name === 'TimeoutError' ||
        error?.code === 'ABORT_ERR'
    );
}

function withAbortSignal(
    params: LanguageModelV4CallOptions,
    ctx?: IRunnerContext,
): LanguageModelV4CallOptions {
    if (!ctx?.signal) return params;
    const existing = params.abortSignal;
    const merged =
        existing && typeof AbortSignal.any === 'function'
            ? AbortSignal.any([existing, ctx.signal])
            : ctx.signal;
    return { ...params, abortSignal: merged };
}

function wrapWithLimiter(
    c: Candidate,
    ctx?: IRunnerContext,
    holdTimeoutMs: number = DEFAULT_HOLD_TIMEOUT_MS,
): LanguageModelV4 {
    const base = createModel(c.provider, c.model.id);

    const mw: LanguageModelV4Middleware = {
        specificationVersion: 'v4',

        transformParams: async ({ params }) => withAbortSignal(params, ctx),

        // 非流式:Promise settle 即自动释放
        wrapGenerate: async ({ doGenerate }) => {
            if (ctx?.isAborted) {
                throw new DOMException('Aborted by context', 'AbortError');
            }
            return c.limiter.run(() => doGenerate());
        },

        // 流式:acquire 拿 slot,流结束/出错/abort/超时 四重释放保障
        wrapStream: async ({ doStream }) => {
            if (ctx?.isAborted) {
                throw new DOMException('Aborted by context', 'AbortError');
            }

            // 1) 先拿 slot(带 15 分钟兜底超时)
            const handle = await c.limiter.acquire(holdTimeoutMs, () => {
                (ctx?.warn ?? console.warn)(
                    `⏰ [chat-stream] slot 持有超时(${holdTimeoutMs}ms),强制释放 (${c.provider.id}::${c.model.id})`,
                );
            });

            // abort 兜底:signal 触发即释放
            const onAbort = () => handle.release();
            if (ctx?.signal) {
                if (ctx.signal.aborted) handle.release();
                else ctx.signal.addEventListener('abort', onAbort, { once: true });
            }

            let result: Awaited<ReturnType<typeof doStream>>;
            try {
                result = await doStream();
            } catch (e) {
                // 启动阶段失败:释放并抛出(让 fallback 处理)
                handle.release();
                throw e;
            }

            const { stream, ...rest } = result;

            const monitored = stream.pipeThrough(
                new TransformStream({
                    transform(chunk, controller) {
                        controller.enqueue(chunk);
                    },
                    flush() {
                        handle.release(); // 流正常结束
                    },
                }),
            );

            return { stream: monitored, ...rest };
        },
    };

    return wrapLanguageModel({ model: base, middleware: mw });
}

function buildFallbackModel(
    candidates: Candidate[],
    ctx?: IRunnerContext,
    holdTimeoutMs?: number,
): LanguageModelV4 {
    const wrapped = candidates.map((c) => wrapWithLimiter(c, ctx, holdTimeoutMs));
    const fallbackMw: LanguageModelV4Middleware = {
        specificationVersion: 'v4',
        wrapGenerate: async ({ doGenerate, params }) => {
            let lastErr: unknown;
            for (let i = 0; i < wrapped.length; i++) {
                if (ctx?.isAborted) {
                    throw new DOMException('Aborted by context', 'AbortError');
                }
                const c = candidates[i];
                try {
                    if (i === 0) return await doGenerate();
                    return await wrapped[i].doGenerate(params);
                } catch (e) {
                    lastErr = e;
                    // abort:立即终止,不再尝试
                    if (isAbortError(e) || ctx?.isAborted) {
                        (ctx?.warn ?? console.warn)(
                            `[chat] 已取消,终止 fallback (${c.provider.id}::${c.model.id})`,
                        );
                        throw e;
                    }
                    const isLast = i === wrapped.length - 1;
                    const status =
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (e as any)?.statusCode ?? (e as any)?.status ?? 'err';
                    if (isLast) {
                        // 最后一个候选也失败:抛出,交给上层(上层需 .catch)
                        (ctx?.error ?? console.error)(
                            `❌ [chat] 所有候选均失败,最后 [${c.provider.id}::${c.model.id}] (${status})`,
                        );
                        throw e;
                    }
                    // 非最后一个:无论什么错误都尝试下一个候选
                    (ctx?.warn ?? console.warn)(
                        `🚨 [chat] 候选 [${c.provider.id}::${c.model.id}] 失败 (${status}),尝试下一个...`,
                    );
                }
            }
            throw lastErr;
        },
        wrapStream: async ({ doStream, params }) => {
            let lastErr: unknown;
            for (let i = 0; i < wrapped.length; i++) {
                if (ctx?.isAborted) {
                    throw new DOMException('Aborted by context', 'AbortError');
                }
                const c = candidates[i];
                try {
                    if (i === 0) return await doStream();
                    return await wrapped[i].doStream(params);
                } catch (e) {
                    lastErr = e;
                    if (isAbortError(e) || ctx?.isAborted) {
                        (ctx?.warn ?? console.warn)(
                            `[chat-stream] 已取消,终止 fallback (${c.provider.id}::${c.model.id})`,
                        );
                        throw e;
                    }
                    const isLast = i === wrapped.length - 1;
                    if (isLast) {
                        (ctx?.error ?? console.error)(
                            `❌ [chat-stream] 所有候选均失败,最后 [${c.provider.id}::${c.model.id}]`,
                        );
                        throw e;
                    }
                    (ctx?.warn ?? console.warn)(
                        `🚨 [chat-stream] 候选 [${c.provider.id}::${c.model.id}] 失败,尝试下一个...`,
                    );
                }
            }
            throw lastErr;
        },
    };
    return wrapLanguageModel({ model: wrapped[0], middleware: fallbackMw });
}

export function getSmartModel(
    opts: GetSmartModelOptions = {},
    ctx?: IRunnerContext,
): LanguageModelV4 {
    const holdTimeout = opts.streamHoldTimeoutMs ?? DEFAULT_HOLD_TIMEOUT_MS;

    // ===== 分支 1:精确指定,不 fallback,只占并发通道 =====
    if (opts.exact) {
        const { providerId, modelId } = opts.exact;
        const providers = syncAndGetProviders();
        const pv = providers.find((p) => p.id === providerId);
        if (!pv) {
            throw new Error(
                `[getSmartModel] 精确指定失败:找不到 provider "${providerId}"(可能已禁用或移除)`,
            );
        }
        const model = pv.models.find((m) => m.id === modelId);
        if (!model) {
            throw new Error(
                `[getSmartModel] 精确指定失败:provider "${providerId}" 下无模型 "${modelId}"`,
            );
        }
        const limiter = getLimiter(providerId);
        if (!limiter) {
            throw new Error(
                `[getSmartModel] 精确指定失败:provider "${providerId}" 无并发通道`,
            );
        }
        return wrapWithLimiter({ provider: pv, model, limiter }, ctx, holdTimeout);
    }

    // ===== 分支 2:能力筛选 + 正则 + fallback =====
    let candidates = selectCandidates({
        category: ModelTags.TextGeneration,
        requiredAbilities: opts.requiredAbilities,
        preferVersion: opts.preferVersion,
        minScore: opts.minScore,
        sort: opts.sort,
    });

    if (opts.modelPattern) {
        const re = opts.modelPattern;
        candidates = candidates.filter((c) => re.test(c.model.id));
    }

    if (candidates.length === 0) {
        throw new Error(
            `[getSmartModel] 无满足要求的 chat 模型 abilities=[${(
                opts.requiredAbilities ?? []
            ).join(', ')}] preferVersion=${opts.preferVersion ?? '任意'} minScore=${opts.minScore ?? 0
            }${opts.modelPattern ? ` pattern=${opts.modelPattern}` : ''}`,
        );
    }

    return buildFallbackModel(candidates, ctx, holdTimeout);
}