<script lang="ts">
  import type { Snippet } from "svelte";

  import { Button } from "$lib/components/ui/button";
  import { pacStore } from "$lib/store/ui/pac.svelte";
  import { IconDeviceFloppy, IconLoader2 } from "@tabler/icons-svelte";

  import { formatDate, prettyPath } from "./editor-utils";

  let { toolbar }: { toolbar?: Snippet } = $props();
</script>

<header class="flex shrink-0 items-center gap-3 overflow-hidden">
  <div
    class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none"
  >
    {@render toolbar?.()}

    {#if pacStore.saving}
      <IconLoader2
        size={18}
        stroke={1.5}
        class="shrink-0 animate-spin text-muted-foreground"
      />
    {/if}

    <Button
      variant="outline"
      size="sm"
      class="shrink-0 rounded-lg"
      disabled={!pacStore.dirty || pacStore.saving}
      onclick={() => void pacStore.save()}
    >
      <IconDeviceFloppy size={16} stroke={1.5} />
      保存
    </Button>
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
