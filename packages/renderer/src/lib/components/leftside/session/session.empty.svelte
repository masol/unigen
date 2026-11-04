<!-- packages/renderer/src/lib/components/leftside/session/session.empty.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import {
    IconMessage,
    IconRefresh,
    IconSearchOff,
  } from "@tabler/icons-svelte";
</script>

<div
  class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
>
  <div class="flex size-12 items-center justify-center rounded-2xl bg-muted">
    {#if sessionStore.hasSearch}
      <IconSearchOff class="size-5 text-muted-foreground" stroke={1.5} />
    {:else}
      <IconMessage class="size-5 text-muted-foreground" stroke={1.5} />
    {/if}
  </div>

  <div class="space-y-1">
    <p class="text-sm font-medium text-foreground">
      {sessionStore.hasSearch ? "未找到匹配的会话" : "暂无会话"}
    </p>
    <p class="text-xs text-muted-foreground">
      {#if sessionStore.hasSearch}
        没有找到与「{sessionStore.searchQuery.trim()}」相关的会话
      {:else}
        新会话将显示在这里
      {/if}
    </p>
  </div>

  {#if sessionStore.hasSearch}
    <Button
      variant="outline"
      size="sm"
      class="h-8 gap-1.5 rounded-xl px-3 text-xs"
      onclick={() => sessionStore.clearSearch()}
    >
      <IconRefresh class="size-3.5" stroke={1.5} />
      重置搜索
    </Button>
  {/if}
</div>
