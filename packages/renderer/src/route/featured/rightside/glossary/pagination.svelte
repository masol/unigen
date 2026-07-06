<!-- $lib/components/glossary/glossary-pagination.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { IconChevronLeft, IconChevronRight } from "@tabler/icons-svelte";
  import { blueprintStore } from "./store.svelte.js";
</script>

<div class="flex items-center justify-between gap-2">
  <span class="text-xs text-muted-foreground tabular-nums">
    {#if blueprintStore.total > 0}
      第 {blueprintStore.pageIndex + 1} / {blueprintStore.pageCount} 页 · 共 {blueprintStore.total}
      条
    {:else}
      共 0 条
    {/if}
  </span>
  <div class="flex items-center gap-1.5">
    <Button
      variant="outline"
      size="icon"
      class="size-8 rounded-xl transition-all duration-200"
      onclick={() => blueprintStore.prevPage()}
      disabled={!blueprintStore.canPrev || blueprintStore.isLoading}
    >
      <span class="sr-only">上一页</span>
      <IconChevronLeft size={20} stroke={1.5} />
    </Button>
    <Button
      variant="outline"
      size="icon"
      class="size-8 rounded-xl transition-all duration-200"
      onclick={() => blueprintStore.nextPage()}
      disabled={!blueprintStore.canNext || blueprintStore.isLoading}
    >
      <span class="sr-only">下一页</span>
      <IconChevronRight size={20} stroke={1.5} />
    </Button>
  </div>
</div>
