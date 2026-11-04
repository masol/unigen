<!-- packages/renderer/src/lib/components/leftside/session/session.header.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import {
    IconLoader2,
    IconPlus,
    IconSearch,
    IconX,
  } from "@tabler/icons-svelte";

  // 本组件通过 headerComponent 注入 PanelHeader，
  // 运行在固定 h-9 (36px) 的面板头部内，所有控件必须收敛进该高度。
  let { isMaximized = false }: { isMaximized?: boolean } = $props();

  // 中文输入法组合期间不写入 store，避免对拼音片段执行无效搜索
  let isComposing = $state(false);

  function handleInput(e: Event) {
    if (isComposing) return;
    sessionStore.setSearchQuery((e.target as HTMLInputElement).value);
  }

  function handleCompositionEnd(e: CompositionEvent) {
    isComposing = false;
    sessionStore.setSearchQuery((e.target as HTMLInputElement).value);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      sessionStore.clearSearch();
      (e.target as HTMLInputElement).blur();
    }
  }

  async function handleCreate() {
    // 创建前清除搜索过滤，确保新会话在列表中立即可见
    if (sessionStore.hasSearch) sessionStore.clearSearch();
    await sessionStore.createSession();
  }
</script>

<div class="flex h-full w-full min-w-0 items-center gap-1.5 px-1">
  <!-- 搜索框 -->
  <div
    class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-2 transition-all duration-200 focus-within:border-primary/40"
  >
    <IconSearch class="size-3.5 shrink-0 text-muted-foreground" stroke={1.5} />
    <input
      type="text"
      placeholder="搜索会话…"
      value={sessionStore.searchQuery}
      oninput={handleInput}
      onkeydown={handleKeydown}
      oncompositionstart={() => (isComposing = true)}
      oncompositionend={handleCompositionEnd}
      class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      spellcheck="false"
      autocomplete="off"
    />
    {#if sessionStore.searchQuery}
      <button
        type="button"
        aria-label="清除搜索"
        class="shrink-0 text-muted-foreground transition-all duration-200 hover:text-foreground"
        onclick={() => sessionStore.clearSearch()}
      >
        <IconX class="size-3" stroke={1.5} />
      </button>
    {/if}
  </div>

  <!-- 最大化时空间充裕，补充会话总数 -->
  {#if isMaximized}
    <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
      {sessionStore.sessions.length} 个会话
    </span>
  {/if}

  <!-- 新建会话 -->
  <Button
    variant="ghost"
    size="icon"
    title="新建会话"
    aria-label="新建会话"
    disabled={sessionStore.isCreating}
    class="size-7 shrink-0 rounded-lg text-primary transition-all duration-200 hover:bg-primary/10 hover:text-primary"
    onclick={handleCreate}
  >
    {#if sessionStore.isCreating}
      <IconLoader2 class="size-4 animate-spin" stroke={1.5} />
    {:else}
      <IconPlus class="size-4" stroke={1.5} />
    {/if}
  </Button>
</div>
