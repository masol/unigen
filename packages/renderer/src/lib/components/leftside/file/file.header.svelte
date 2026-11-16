<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    IconRefresh,
    IconReload,
    IconSearch,
    IconX,
  } from "@tabler/icons-svelte";
  import { untrack } from "svelte";
  import { fileStore } from "./file.store.svelte";

  let { isMaximized = false }: { isMaximized?: boolean } = $props();

  let isComposing = $state(false);

  // 本地镜像：输入框即时回显，store 延迟同步（防抖）。
  // 直接 value={fileStore.searchQuery} 在防抖期间会因重渲染把输入写回旧值。
  let inputValue = $state(fileStore.searchQuery);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  // 仅当 store 的 searchQuery 被外部改变（Escape / X / 程序化清除）时同步回输入框。
  $effect(() => {
    const q = fileStore.searchQuery;
    untrack(() => {
      if (inputValue !== q) inputValue = q;
    });
  });

  // 卸载时清理 pending timer
  $effect(() => {
    return () => clearTimeout(searchTimer);
  });

  function scheduleSearch(value: string) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = undefined;
      fileStore.setSearchQuery(value);
    }, 150);
  }

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    inputValue = value;
    if (isComposing) return;
    scheduleSearch(value);
  }

  function handleCompositionEnd(e: CompositionEvent) {
    isComposing = false;
    const value = (e.target as HTMLInputElement).value;
    inputValue = value;
    scheduleSearch(value);
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      clearTimeout(searchTimer);
      searchTimer = undefined;
      inputValue = "";
      fileStore.clearSearch();
      (e.target as HTMLInputElement).blur();
    }
  }

  function handleClearSearch() {
    clearTimeout(searchTimer);
    searchTimer = undefined;
    inputValue = "";
    fileStore.clearSearch();
  }

  async function handleRecompile() {
    await fileStore.reCompile();
  }
</script>

<div class="flex h-full w-full min-w-0 items-center gap-1.5 px-1">
  <div
    class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-2 transition-all duration-200 focus-within:border-primary/40"
  >
    <IconSearch class="size-3.5 shrink-0 text-muted-foreground" stroke={1.5} />
    <input
      type="text"
      placeholder="搜索文件…"
      value={inputValue}
      oninput={handleSearchInput}
      onkeydown={handleSearchKeydown}
      oncompositionstart={() => (isComposing = true)}
      oncompositionend={handleCompositionEnd}
      class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      spellcheck="false"
      autocomplete="off"
    />
    {#if inputValue}
      <button
        type="button"
        aria-label="清除搜索"
        class="shrink-0 text-muted-foreground transition-all duration-200 hover:text-foreground"
        onclick={handleClearSearch}
      >
        <IconX class="size-3" stroke={1.5} />
      </button>
    {/if}
  </div>

  {#if isMaximized}
    <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
      {fileStore.tree ? "已加载" : "未加载"}
    </span>
  {/if}

  <Button
    variant="ghost"
    size="icon"
    title="为AI加载最新指南"
    aria-label="为AI加载最新指南"
    disabled={fileStore.isLoading}
    class="size-7 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
    onclick={handleRecompile}
  >
    {#if fileStore.isLoading}
      <IconReload class="size-4 animate-spin" stroke={1.5} />
    {:else}
      <IconRefresh class="size-4" stroke={1.5} />
    {/if}
  </Button>
</div>
