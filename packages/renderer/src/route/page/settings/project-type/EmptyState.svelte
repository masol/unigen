<script lang="ts">
  import { IconMoodEmpty } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade } from "svelte/transition";

  type Props = {
    title: string;
    description?: string;
    children?: Snippet; // 可选的操作区(按钮等)
  };
  let { title, description, children }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center gap-3 py-16 text-center"
  in:fade={{ duration: 180, easing: cubicInOut }}
>
  <span
    class="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
  >
    <IconMoodEmpty class="size-7" />
  </span>
  <div class="space-y-1">
    <p class="text-sm font-medium text-foreground">{title}</p>
    {#if description}
      <p class="max-w-sm text-xs text-muted-foreground">{description}</p>
    {/if}
  </div>
  {#if children}
    <div class="pt-1">{@render children()}</div>
  {/if}
</div>
