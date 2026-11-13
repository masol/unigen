import { safeApi } from "$lib/utils/api";
import type { ToolSearchItem } from "@app/main/types";

function toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? "未知错误");
}

const PAGE_SIZE = 30;

class ToolSearchPanelStore {
    query = $state("");
    loading = $state(false);
    loadingMore = $state(false);
    searched = $state(false);
    error = $state<string | null>(null);
    results = $state<ToolSearchItem[]>([]);
    hasMore = $state(false);

    #requestId = 0;
    // 记录「上一次真正发出」的 query，避免用户在输入框改了字但没按回车时，
    // loadMore 误用新 query 把不同语义的下一页拼进当前列表。
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
        // 空 query 是合法请求：表示枚举全部工具。
        const query = this.query.trim();
        const requestId = ++this.#requestId;
        this.loading = true;
        this.loadingMore = false;
        this.error = null;
        // 保留旧结果，避免已有列表被替换成首屏 spinner 闪空；
        // 新查询成功后替换，失败后清空并进入错误态。

        try {
            const result = await safeApi().agent.searchTools({
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
            // - 模板中 `loading && !searched` 只在「首次/重试加载中」出现；
            // - 错误显示走 `error && results.length === 0` 分支；
            // - 用户点「重试」时，loading 一开即回到「正在检索」而不是闪「未找到」。
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
        // 空 query 也允许加载更多；不能判断 query 是否为空。
        if (!this.hasMore || this.loadingMore || this.loading) {
            return;
        }

        const requestId = ++this.#requestId;
        this.loadingMore = true;
        this.error = null;

        try {
            const result = await safeApi().agent.searchTools({
                // 关键修复：用本次列表真正对应的 query，而非输入框当前值。
                query: this.#searchedQuery,
                limit: PAGE_SIZE,
                offset: this.results.length,
            });

            if (requestId !== this.#requestId) return;

            this.results = [...this.results, ...result.items];
            this.hasMore = result.hasMore;
        } catch (error) {
            if (requestId !== this.#requestId) return;
            // 保留已加载列表，仅显示错误，避免打断浏览。
            this.error = toErrorMessage(error);
        } finally {
            if (requestId === this.#requestId) {
                this.loadingMore = false;
            }
        }
    }
}

const KEY = Symbol.for("unigen.renderer.toolSearchPanelStore");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toolSearchStore: ToolSearchPanelStore = ((globalThis as any)[KEY] ??=
    new ToolSearchPanelStore());