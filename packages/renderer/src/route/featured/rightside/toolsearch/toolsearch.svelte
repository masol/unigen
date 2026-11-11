<script lang="ts">
  import type { ToolSearchItem } from "@app/main/types";
  import VirtualList from "@humanspeak/svelte-virtual-list";
  import {
    IconAlertTriangle,
    IconLoader2,
    IconSearch,
    IconTool,
  } from "@tabler/icons-svelte";
  import { toolSearchStore } from "./store.svelte";
  import ToolSearchHeader from "./toolsearch.header.svelte";

  const ESTIMATED_ITEM_SIZE = 140;
  const BUFFER_SIZE = 20;
  const LOAD_MORE_THRESHOLD = 10;

  interface DetailRow {
    key: string;
    label: string;
    value: string;
  }

  function stringifyMetaValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value == null) return "";
    try {
      const text = JSON.stringify(value);
      return text === "{}" || text === "[]" ? "" : text;
    } catch {
      return String(value);
    }
  }

  function buildDetailRows(item: ToolSearchItem): DetailRow[] {
    const rows: DetailRow[] = [];
    if (item.id) rows.push({ key: "id", label: "ID", value: item.id });
    const meta = item.metadata ?? {};
    if (typeof meta.source === "string" && meta.source) {
      rows.push({ key: "source", label: "来源", value: meta.source });
    }
    if (typeof meta.serverId === "string" && meta.serverId) {
      rows.push({ key: "serverId", label: "服务", value: meta.serverId });
    }
    for (const [metaKey, raw] of Object.entries(meta)) {
      if (metaKey === "source" || metaKey === "serverId") continue;
      const value = stringifyMetaValue(raw);
      if (value) rows.push({ key: `meta:${metaKey}`, label: metaKey, value });
    }
    return rows;
  }

  function getItemKey(item: { id: string }): string {
    return item.id;
  }

  function handleLoadMore(): Promise<void> {
    return toolSearchStore.loadMore();
  }
</script>

<div class="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
  <div class="shrink-0 border-b border-border/50 px-3 py-2">
    <ToolSearchHeader />
  </div>

  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-3">
    {#if toolSearchStore.loading && !toolSearchStore.searched}
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
        <p class="text-sm font-medium text-foreground">正在检索工具…</p>
      </div>
    {:else if toolSearchStore.error && toolSearchStore.results.length === 0}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-destructive/10"
        >
          <IconAlertTriangle class="size-5 text-destructive" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">工具检索失败</p>
          <p class="wrap-break-word text-xs text-muted-foreground">
            {toolSearchStore.error}
          </p>
        </div>
        <button
          class="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
          onclick={() => void toolSearchStore.search()}>重试</button
        >
      </div>
    {:else if !toolSearchStore.searched}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-muted"
        >
          <IconTool class="size-5 text-muted-foreground" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">检索全局工具</p>
          <p class="text-xs text-muted-foreground">
            输入关键词后按回车；留空按回车可浏览全部工具。
          </p>
        </div>
      </div>
    {:else if toolSearchStore.results.length === 0}
      <div
        class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
      >
        <div
          class="flex size-12 items-center justify-center rounded-2xl bg-muted"
        >
          <IconSearch class="size-5 text-muted-foreground" stroke={1.5} />
        </div>
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">未找到匹配工具</p>
          <p class="text-xs text-muted-foreground">尝试更宽泛的关键词。</p>
        </div>
      </div>
    {:else}
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          class="mb-2 flex shrink-0 items-center justify-between px-1 text-xs text-muted-foreground"
        >
          <span>已加载 {toolSearchStore.results.length} 个工具</span>
          {#if toolSearchStore.loading}
            <span class="inline-flex items-center gap-1">
              <IconLoader2 class="size-3 animate-spin" stroke={1.5} /> 正在检索…
            </span>
          {:else if toolSearchStore.hasMore && !toolSearchStore.error}
            <span class="inline-flex items-center gap-1">
              {#if toolSearchStore.loadingMore}
                <IconLoader2 class="size-3 animate-spin" stroke={1.5} />
              {/if}
              滚动加载更多
            </span>
          {:else if toolSearchStore.error}
            <span class="text-destructive">加载更多失败</span>
          {:else}
            <span>已全部加载</span>
          {/if}
        </div>

        {#if toolSearchStore.error}
          <div
            class="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="min-w-0 wrap-break-word"
                >加载更多失败：{toolSearchStore.error}</span
              >
              <button
                class="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 font-medium transition-colors hover:bg-destructive/15 disabled:opacity-50"
                disabled={toolSearchStore.loadingMore}
                onclick={() => void toolSearchStore.loadMore()}>重试</button
              >
            </div>
          </div>
        {/if}

        <!--
          VirtualList 需要：
          - 父级有确定高度（flex-1 min-h-0）
          - 父级 position: relative
          - contentClass 预留右内边距（pe-2），
            避免 item 的 100% 宽度覆盖到滚动条轨道上
        -->
        <div
          class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <VirtualList
            items={toolSearchStore.results}
            itemKey={getItemKey}
            defaultEstimatedItemSize={ESTIMATED_ITEM_SIZE}
            bufferSize={BUFFER_SIZE}
            hasMore={toolSearchStore.hasMore &&
              !toolSearchStore.loading &&
              !toolSearchStore.error}
            loadMoreThreshold={LOAD_MORE_THRESHOLD}
            onLoadMore={handleLoadMore}
            containerClass="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            viewportClass="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
            contentClass="min-w-0 pb-2 pe-2"
            itemsClass="min-w-0"
            viewportLabel="工具检索结果"
          >
            {#snippet renderItem(item)}
              {@const details = buildDetailRows(item)}
              <article
                class="mb-2 min-w-0 rounded-xl border border-border/50 bg-background p-3 transition-colors hover:border-border"
              >
                <div class="flex items-start justify-between gap-2">
                  <h3
                    class="min-w-0 truncate text-sm font-medium text-foreground"
                  >
                    {item.name || item.id}
                  </h3>
                  {#if item.rerankScore !== undefined}
                    <span
                      class="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums text-primary"
                      title="相关度分数"
                    >
                      {item.rerankScore.toFixed(3)}
                    </span>
                  {/if}
                </div>
                {#if item.description}
                  <p
                    class="mt-1 wrap-break-word text-xs leading-relaxed text-muted-foreground"
                  >
                    {item.description}
                  </p>
                {/if}
                {#if details.length > 0}
                  <dl
                    class="mt-2.5 grid min-w-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[11px]"
                  >
                    {#each details as row (row.key)}
                      <dt class="whitespace-nowrap text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd class="min-w-0 break-all text-foreground/90">
                        {row.value}
                      </dd>
                    {/each}
                  </dl>
                {/if}
              </article>
            {/snippet}
          </VirtualList>
        </div>
      </div>
    {/if}
  </div>
</div>
