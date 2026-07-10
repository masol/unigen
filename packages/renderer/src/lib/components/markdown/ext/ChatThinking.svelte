<!-- src/lib/components/chat/ChatThinking.svelte -->
<script lang="ts">
  import { IconBulb } from "@tabler/icons-svelte";
  import type { Snippet } from "svelte";

  let { children }: { children?: Snippet } = $props();
</script>

<div
  class="my-2 flex items-start gap-2 rounded-xl border border-border/50 bg-muted/40 p-3 text-xs text-muted-foreground"
>
  <IconBulb size={16} stroke={1.5} class="mt-0.5 shrink-0 text-primary" />
  <div class="min-w-0 flex-1 italic leading-relaxed">
    {#if children}{@render children()}{/if}
  </div>
</div>
