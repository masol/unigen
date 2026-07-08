<!-- SettingRow.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    description,
    control,
  }: {
    title?: string;
    // 既可传普通字符串，也可传 snippet（需要内嵌链接/按钮时）
    description?: string | Snippet;
    control?: Snippet;
  } = $props();
</script>

<div
  class="flex items-center justify-between gap-6 p-6 transition-all duration-200 hover:bg-muted/30"
>
  <div class="min-w-0 space-y-1">
    <p class="text-sm font-medium text-foreground">{title}</p>
    {#if typeof description === "function"}
      <p class="text-xs text-muted-foreground">{@render description()}</p>
    {:else if description}
      <div class="text-xs text-muted-foreground">{description}</div>
    {/if}
  </div>
  <div class="shrink-0">
    {@render control?.()}
  </div>
</div>
