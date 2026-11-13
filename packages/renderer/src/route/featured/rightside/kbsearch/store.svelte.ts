import { safeApi } from "$lib/utils/api";
import type { KnowledgeBaseSearchItem } from "@app/main/types";

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? "未知错误");
}

const PAGE_SIZE = 30;

class KbSearchPanelStore {
    query = $state("");
    loading = $state(false);
    loadingMore = $state(false);
    searched = $state(false);
    error = $state<string | null>(null);
    results = $state<KnowledgeBaseSearchItem[]>([]);
    hasMore = $state(false);

    #requestId = 0;
    // 记录本次列表真正对应的 query。
    #searchedQuery = "";

    clearSearch() {
        this.#requestId++;
        this.#searchedQuery = "";
        this.query = "";
        this.loading = false;
        this.loadingMore = false;
        this.searched = false;
        this.error = null;
        this.results = [];
        this.hasMore = false;
    }

    async search() {
        const query = this.query.trim();

        // chunk 检索必须有查询词；空查询回到初始提示，不再枚举知识库目录。
        if (!query) {
            this.clearSearch();
            return;
        }

        const requestId = ++this.#requestId;
        this.loading = true;
        this.loadingMore = false;
        this.error = null;
        // 保留旧结果，避免已有列表被替换成首屏 spinner 闪空。

        try {
            const result = await safeApi().agent.searchKnowledgeBases({
                query,
                limit: PAGE_SIZE,
                offset: 0,
            });

            if (requestId !== this.#requestId) return;

            this.results = result.items;
            this.hasMore = result.hasMore;
            this.searched = true;
            this.#searchedQuery = query;
        } catch (error) {
            if (requestId !== this.#requestId) return;

            this.error = toErrorMessage(error);
            // 错误态保持 searched=false，让「重试中」稳定命中
            // `loading && !searched` 分支。
            this.searched = false;
            this.results = [];
            this.hasMore = false;
            this.#searchedQuery = query;
        } finally {
            if (requestId === this.#requestId) {
                this.loading = false;
            }
        }
    }

    async loadMore(): Promise<void> {
        if (!this.hasMore || this.loadingMore || this.loading) {
            return;
        }

        const requestId = ++this.#requestId;
        this.loadingMore = true;
        this.error = null;

        try {
            const result = await safeApi().agent.searchKnowledgeBases({
                // 使用本次列表对应的 query，而非输入框当前值。
                query: this.#searchedQuery,
                limit: PAGE_SIZE,
                offset: this.results.length,
            });

            if (requestId !== this.#requestId) return;

            this.results = [...this.results, ...result.items];
            this.hasMore = result.hasMore;
        } catch (error) {
            if (requestId !== this.#requestId) return;
            // 保留已加载列表，仅显示错误。
            this.error = toErrorMessage(error);
        } finally {
            if (requestId === this.#requestId) {
                this.loadingMore = false;
            }
        }
    }
}

const KEY = Symbol.for("unigen.renderer.kbSearchPanelStore");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const kbSearchStore: KbSearchPanelStore = ((globalThis as any)[KEY] ??=
    new KbSearchPanelStore());