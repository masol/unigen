import { safeApi } from '$lib/utils/api';
import type { SkillSearchItem } from '@app/main/types';

const PAGE_SIZE = 100;

/**
 * 搜索防抖延迟。
 *
 * 200ms 对齐 Algolia 对“type-ahead / autocomplete”的推荐值：
 * 低于 200ms 仍可能感受到内容闪烁，高于 300ms 开始明显迟钝。
 * 搜索按钮与 Enter 键会绕过此防抖，立即触发。
 */
const SEARCH_DEBOUNCE_MS = 200;

class SkillStore {
    /** 浏览态（query 为空）的全量分页数据。 */
    items = $state.raw<SkillSearchItem[]>([]);

    /**
     * 搜索态的服务端权威结果。
     * - null：尚未完成过搜索（此时展示列表回退到 items）；
     * - 数组：最近一次成功返回的结果。
     *
     * 搜索进行中绝不置空，保证「冻结当前内容、返回后一次性切换」。
     */
    searchResults = $state.raw<SkillSearchItem[] | null>(null);

    loading = $state(false);
    loadingMore = $state(false);
    searching = $state(false);
    error = $state('');
    hasMore = $state(false);
    searchHasMore = $state(false);
    installing = $state(false);
    removingIds = $state<string[]>([]);

    #query = $state('');
    #requestSeq = 0;
    #searchSeq = 0;
    #searchTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * 通过 getter/setter 触发搜索。
     *
     * 不用 $effect.root 的原因：skillStore 是模块顶层单例，构造时
     * 没有稳定的组件 owner，$effect 在部分运行时会静默失效。
     * setter 方案不依赖 effect 生命周期，每次 bind:query 赋值都会
     * 走 #scheduleSearch，可靠且与 Svelte 响应式无缝协作。
     */
    get query(): string {
        return this.#query;
    }
    set query(next: string) {
        if (this.#query === next) return;
        this.#query = next;
        this.#scheduleSearch(next);
    }

    /**
     * 当前应展示的列表。
     *
     * 关键：搜索进行中返回「上一份权威结果」，而不是本地即时过滤。
     * 这样输入时列表完全冻结，只在服务端返回后整体切换，配合父级
     * 遮罩与 autoAnimate 补间，彻底消除中途闪烁。
     */
    filteredItems = $derived.by(() => {
        if (!this.#query.trim()) return this.items;
        return this.searchResults ?? this.items;
    });

    /** 当前模式（搜索态 / 浏览态）是否还有更多可加载。 */
    get canLoadMore(): boolean {
        return this.#query.trim() ? this.searchHasMore : this.hasMore;
    }

    async load(): Promise<void> {
        const seq = ++this.#requestSeq;

        this.loading = true;
        this.error = '';

        try {
            const result = await safeApi().agent.searchSkills({
                query: '',
                limit: PAGE_SIZE,
                offset: 0,
            });

            if (seq !== this.#requestSeq) return;

            this.items = result.items;
            this.hasMore = result.hasMore;
        } catch (err) {
            if (seq !== this.#requestSeq) return;
            this.error = err instanceof Error ? err.message : '技能列表加载失败';
        } finally {
            if (seq === this.#requestSeq) {
                this.loading = false;
            }
        }
    }

    /**
     * 追加下一页。
     *
     * 浏览态游标基于 items.length，搜索态游标基于 searchResults.length；
     * 通过对应的 seq 校验丢弃过期响应（期间用户改了 query）。
     */
    async loadMore(): Promise<void> {
        if (this.loading || this.loadingMore || this.searching) return;

        const q = this.#query.trim();
        if (!this.canLoadMore) return;

        const seq = q ? this.#searchSeq : this.#requestSeq;
        const offset = q ? (this.searchResults?.length ?? 0) : this.items.length;

        this.loadingMore = true;
        this.error = '';

        try {
            const result = await safeApi().agent.searchSkills({
                query: q,
                limit: PAGE_SIZE,
                offset,
            });

            const stale = q ? seq !== this.#searchSeq : seq !== this.#requestSeq;
            if (stale) return;

            if (q) {
                this.searchResults = [
                    ...(this.searchResults ?? []),
                    ...result.items,
                ];
                this.searchHasMore = result.hasMore;
            } else {
                this.items = [...this.items, ...result.items];
                this.hasMore = result.hasMore;
            }
        } catch (err) {
            const current = q
                ? seq === this.#searchSeq
                : seq === this.#requestSeq;
            if (current) {
                this.error =
                    err instanceof Error ? err.message : '加载更多失败';
            }
        } finally {
            // 同一时刻只允许一个 loadMore，无条件复位即可。
            this.loadingMore = false;
        }
    }

    /**
     * 立即触发搜索，绕过防抖。
     *
     * 用于搜索按钮点击与 Enter 键：用户显式提交时不应再等 200ms。
     * 同时取消尚未触发的防抖计时器，避免稍后重复请求。
     */
    searchNow(): void {
        const q = this.#query.trim();

        if (this.#searchTimer) {
            clearTimeout(this.#searchTimer);
            this.#searchTimer = null;
        }

        if (!q) {
            this.searchResults = null;
            this.searchHasMore = false;
            this.searching = false;
            return;
        }

        const seq = ++this.#searchSeq;
        this.searching = true;
        void this.#runSearch(q, seq);
    }

    /**
     * 安装技能。
     *
     * 来源选择与解压安装都由主进程完成；安装成功后由客户端主动刷新列表。
     *
     * @returns 是否真正完成安装；用户取消时返回 false。
     * @throws 安装失败时抛出错误，供调用方 toast 展示。
     */
    async install(): Promise<boolean> {
        if (this.installing) return false;

        this.installing = true;
        try {
            const result = await safeApi().agent.installSkill();

            // 防御：API 层在业务失败场景下可能返回 null，
            // 不能直接访问 result.canceled。
            if (!result) {
                throw new Error('技能安装失败');
            }

            if (result.canceled) return false;

            await this.load();

            // query 未变时 setter 不会重跑，需要手动补一次搜索，
            // 否则刚安装的技能在搜索态下不可见。
            const q = this.#query.trim();
            if (q) {
                const seq = ++this.#searchSeq;
                await this.#runSearch(q, seq);
            }

            return true;
        } finally {
            this.installing = false;
        }
    }

    async remove(id: string): Promise<void> {
        if (this.removingIds.includes(id)) return;

        this.removingIds = [...this.removingIds, id];
        try {
            await safeApi().agent.deleteSkill({ id });
            this.items = this.items.filter((item) => item.id !== id);
            if (this.searchResults) {
                this.searchResults = this.searchResults.filter(
                    (item) => item.id !== id,
                );
            }
        } finally {
            this.removingIds = this.removingIds.filter((item) => item !== id);
        }
    }

    isRemoving(id: string): boolean {
        return this.removingIds.includes(id);
    }

    async openDirectory(): Promise<void> {
        await safeApi().system.showItemInFolder({ path: '::global-skill' });
    }

    #scheduleSearch(next: string): void {
        const q = next.trim();

        if (this.#searchTimer) {
            clearTimeout(this.#searchTimer);
            this.#searchTimer = null;
        }

        if (!q) {
            this.searchResults = null;
            this.searchHasMore = false;
            this.searching = false;
            return;
        }

        this.searching = true;
        const seq = ++this.#searchSeq;
        this.#searchTimer = setTimeout(() => {
            this.#searchTimer = null;
            void this.#runSearch(q, seq);
        }, SEARCH_DEBOUNCE_MS);
    }

    async #runSearch(query: string, seq: number): Promise<void> {
        try {
            const result = await safeApi().agent.searchSkills({
                query,
                limit: PAGE_SIZE,
                offset: 0,
            });

            if (seq !== this.#searchSeq) return;

            this.searchResults = result.items;
            this.searchHasMore = result.hasMore;
            this.error = '';
        } catch (err) {
            if (seq !== this.#searchSeq) return;

            // 失败时保留上一份结果（冻结内容），仅在顶部提示错误，
            // 避免列表被清空成「未找到匹配的技能」造成误导。
            this.error = err instanceof Error ? err.message : '技能检索失败';
        } finally {
            if (seq === this.#searchSeq) {
                this.searching = false;
            }
        }
    }
}

const KEY = Symbol.for('unigen.renderer.skillStore');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const skillStore: SkillStore = ((globalThis as any)[KEY] ??= new SkillStore());