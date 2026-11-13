<script lang="ts">
  import type { KnowledgeBaseSearchItem } from "@app/main/types";
  import VirtualList from "@humanspeak/svelte-virtual-list";
  import {
    IconAlertTriangle,
    IconBook,
    IconLoader2,
    IconSearch,
  } from "@tabler/icons-svelte";
  import KbSearchHeader from "./kbsearch.header.svelte";
  import { kbSearchStore } from "./store.svelte";

  // chunk 卡片包含正文与所属知识库信息，估算高度比目录卡片更高。
  const ESTIMATED_ITEM_SIZE = 150;
  const BUFFER_SIZE = 20;
  const LOAD_MORE_THRESHOLD = 10;

  function getItemKey(item: KnowledgeBaseSearchItem): string {
    return item.id;
  }

  function handleLoadMore(): Promise<void> {
    return kbSearchStore.loadMore();
  }
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ 知识库 chunk 检索结果卡片                           │ -->
<!-- │ 职责：展示片段正文、所属知识库、来源与相关度分数    │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div class="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
  <div class="shrink-0 border-b border-border/50 px-3 py-2">
    <KbSearchHeader />
  </div>

  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-3">
    {#if kbSearchStore.loading && !kbSearchStore.searched}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-muted"
        >
          <IconLoader2
            class="size-5 animate-spin text-muted-foreground"
            stroke={1.5}
          />
        </div>
        <p class="text-sm font-medium text-foreground">正在检索知识库片段…</p>
      </div>
    {:else if kbSearchStore.error && kbSearchStore.results.length === 0}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-destructive/10"
        >
          <IconAlertTriangle class="size-5 text-destructive" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">知识库片段检索失败</p>
          <p class="wrap-break-word text-xs text-muted-foreground">
            {kbSearchStore.error}
          </p>
        </div>
        <button
          class="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
          onclick={() => void kbSearchStore.search()}>重试</button
        >
      </div>
    {:else if !kbSearchStore.searched}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-muted"
        >
          <IconBook class="size-5 text-muted-foreground" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">检索知识库片段</p>
          <p class="text-xs text-muted-foreground">
            输入关键词后按回车，将在全部知识库的文本片段中检索。
          </p>
        </div>
      </div>
    {:else if kbSearchStore.results.length === 0}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-muted"
        >
          <IconSearch class="size-5 text-muted-foreground" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">
            未找到匹配知识库片段
          </p>
          <p class="text-xs text-muted-foreground">尝试更宽泛的关键词。</p>
        </div>
      </div>
    {:else}
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          class="mb-2 flex shrink-0 items-center justify-between px-1 text-xs text-muted-foreground"
        >
          <span>已加载 {kbSearchStore.results.length} 个知识库片段</span>
          {#if kbSearchStore.loading}
            <span class="inline-flex items-center gap-1">
              <IconLoader2 class="size-3 animate-spin" stroke={1.5} /> 正在检索…
            </span>
          {:else if kbSearchStore.hasMore && !kbSearchStore.error}
            <span class="inline-flex items-center gap-1">
              {#if kbSearchStore.loadingMore}
                <IconLoader2 class="size-3 animate-spin" stroke={1.5} />
              {/if}
              滚动加载更多
            </span>
          {:else if kbSearchStore.error}
            <span class="text-destructive">加载更多失败</span>
          {:else}
            <span>已全部加载</span>
          {/if}
        </div>

        {#if kbSearchStore.error}
          <div
            class="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="min-w-0 wrap-break-word"
                >加载更多失败：{kbSearchStore.error}</span
              >
              <button
                class="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 font-medium transition-colors hover:bg-destructive/15 disabled:opacity-50"
                disabled={kbSearchStore.loadingMore}
                onclick={() => void kbSearchStore.loadMore()}>重试</button
              >
            </div>
          </div>
        {/if}

        <div
          class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <VirtualList
            items={kbSearchStore.results}
            itemKey={getItemKey}
            defaultEstimatedItemSize={ESTIMATED_ITEM_SIZE}
            bufferSize={BUFFER_SIZE}
            hasMore={kbSearchStore.hasMore &&
              !kbSearchStore.loading &&
              !kbSearchStore.error}
            loadMoreThreshold={LOAD_MORE_THRESHOLD}
            onLoadMore={handleLoadMore}
            containerClass="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            viewportClass="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
            contentClass="min-w-0 pb-2 pe-2"
            itemsClass="min-w-0"
            viewportLabel="知识库片段检索结果"
          >
            {#snippet renderItem(item)}
              <article
                class="mb-2 min-w-0 rounded-xl border border-border/50 bg-background p-3 transition-colors hover:border-border"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3
                      class="min-w-0 truncate text-sm font-medium text-foreground"
                    >
                      {item.kbName || item.kbId}
                    </h3>
                    {#if item.title || item.source}
                      <p
                        class="mt-0.5 min-w-0 truncate text-[11px] text-muted-foreground"
                      >
                        {item.title}
                        {#if item.title && item.source}
                          <span class="mx-1">·</span>
                        {/if}
                        {item.source}
                      </p>
                    {/if}
                  </div>
                  {#if item.rerankScore !== undefined}
                    <span
                      class="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums text-primary"
                      title="相关度分数"
                    >
                      {item.rerankScore.toFixed(3)}
                    </span>
                  {/if}
                </div>

                <p
                  class="mt-2 wrap-break-word whitespace-pre-wrap text-xs leading-relaxed text-foreground/80"
                >
                  {item.text}
                </p>

                {#if item.kbDescription}
                  <p
                    class="mt-1.5 wrap-break-word text-[10px] leading-relaxed text-muted-foreground"
                  >
                    {item.kbDescription}
                  </p>
                {/if}
              </article>
            {/snippet}
          </VirtualList>
        </div>
      </div>
    {/if}
  </div>
</div>
<!-- ╭─── / 知识库 chunk 检索结果卡片 ───╮ -->
