<script lang="ts">
  import type { Snippet } from "svelte";

  import { pacStore } from "$lib/store/ui/pac.svelte";

  import { formatDate, prettyPath } from "./editor-utils";

  let { toolbar }: { toolbar?: Snippet } = $props();
</script>

<header class="flex shrink-0 items-center gap-3 overflow-hidden">
  <div
    class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none"
  >
    {@render toolbar?.()}
  </div>

  <div class="flex min-w-0 max-w-[40%] shrink-0 flex-col items-end gap-1">
    <h1
      class="w-full truncate text-right text-base font-semibold tracking-tight"
    >
      {pacStore.title || prettyPath(pacStore.currentId ?? "")}
    </h1>

    <p class="w-full truncate text-right text-xs text-muted-foreground">
      更新：{formatDate(pacStore.doc?.updatedAt)}
    </p>

    {#if pacStore.saveError}
      <p class="w-full truncate text-right text-xs text-destructive">
        {pacStore.saveError}
      </p>
    {/if}
  </div>
</header>
