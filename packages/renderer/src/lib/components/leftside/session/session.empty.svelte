<!-- packages/renderer/src/route/featured/leftside/session/session.empty.svelte -->
<script lang="ts">
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import { IconMessage, IconMessageOff } from "@tabler/icons-svelte";
</script>

<div
  class="flex flex-col items-center gap-4 px-6 py-16 text-center animate-fade-in"
>
  <div class="flex size-12 items-center justify-center rounded-2xl bg-muted">
    {#if sessionStore.hasSearch}
      <IconMessageOff class="size-5 text-muted-foreground" stroke={1.5} />
    {:else}
      <IconMessage class="size-5 text-muted-foreground" stroke={1.5} />
    {/if}
  </div>
  <div class="space-y-1">
    <p class="text-sm font-medium text-foreground">
      {sessionStore.hasSearch ? "未找到匹配的会话" : "暂无会话"}
    </p>
    <p class="text-xs text-muted-foreground">
      {sessionStore.hasSearch
        ? "尝试使用其他关键词搜索"
        : "点击上方按钮创建第一个会话"}
    </p>
  </div>
</div>
