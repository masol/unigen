import { Model, ModelTags, Provider } from '$types/index.js';
import { getLimiter, syncAndGetProviders } from './pool-registry.js';
import { ProviderLimiter } from './provider-pool.js';
import { requiredVersionRank, versionRank } from './version.js';

export interface Candidate {
    provider: Provider;
    model: Model;
    limiter: ProviderLimiter;
}

/**
 * 排序策略:决定候选的"强弱链"顺序(fallback 依此链依次上溯)。
 * ⚠️ 空闲优先不属于此策略——它只决定"从链的哪个位置切入",
 *    绝不打乱本链的相对强弱顺序。
 */
export enum SortStrategy {
    VersionDesc = 'version-desc',
    VersionAsc = 'version-asc',
    ScoreDesc = 'score-desc',
    ScoreAsc = 'score-asc',
}

export const DEFAULT_SORT = SortStrategy.VersionDesc;

export interface SelectOptions {
    category: ModelTags.TextGeneration | ModelTags.ImageGeneration;
    requiredAbilities?: ModelTags[];
    preferVersion?: ModelTags;
    minScore?: number;
    sort?: SortStrategy;
}

const DEFAULT_SCORE = 50;

/** 按 sort 策略决定强弱链顺序。返回 <0 表示 a 更"靠前(应先选)"。 */
function compareBySort(a: Candidate, b: Candidate, sort: SortStrategy): number {
    const va = versionRank(a.model.abilities ?? []);
    const vb = versionRank(b.model.abilities ?? []);
    const sa = a.model.score ?? DEFAULT_SCORE;
    const sb = b.model.score ?? DEFAULT_SCORE;

    switch (sort) {
        case SortStrategy.VersionDesc:
            if (vb !== va) return vb - va;
            return sb - sa;
        case SortStrategy.VersionAsc:
            if (va !== vb) return va - vb;
            return sa - sb;
        case SortStrategy.ScoreDesc:
            if (sb !== sa) return sb - sa;
            return vb - va;
        case SortStrategy.ScoreAsc:
            if (sa !== sb) return sa - sb;
            return va - vb;
        default:
            return 0;
    }
}

export function selectCandidates(opts: SelectOptions): Candidate[] {
    const {
        category,
        requiredAbilities = [],
        preferVersion,
        minScore = 0,
        sort = DEFAULT_SORT,
    } = opts;

    const providers = syncAndGetProviders();
    const minVer = requiredVersionRank(preferVersion);
    const candidates: Candidate[] = [];

    for (const pv of providers) {
        const limiter = getLimiter(pv.id);
        if (!limiter) continue;

        for (const model of pv.models) {
            const abilities = model.abilities ?? [];
            if (!abilities.includes(category)) continue;
            const hasAll = requiredAbilities.every((a) => abilities.includes(a));
            if (!hasAll) continue;
            if (versionRank(abilities) < minVer) continue;
            if ((model.score ?? DEFAULT_SCORE) < minScore) continue;
            candidates.push({ provider: pv, model, limiter });
        }
    }

    // 1) 先按 SortStrategy 排出完整强弱链(Array.sort 在现代 V8 中稳定)
    candidates.sort((a, b) => compareBySort(a, b, sort));

    // 2) 稳定分区:有空位者整体提前,已满者整体靠后;
    //    两分区内部都保持强弱链顺序不变。
    //    → 首选 = 链中第一个"有空位"的模型(遵守 sort 语义);
    //    → 已满者退居 fallback 末段,靠 fastq 排队兜底。
    const free: Candidate[] = [];
    const busy: Candidate[] = [];
    for (const c of candidates) {
        (c.limiter.remaining > 0 ? free : busy).push(c);
    }

    return [...free, ...busy];
}