<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    hint,
    children,
  }: {
    label: string;
    hint?: string;
    children: Snippet;
  } = $props();
</script>

<label class="block space-y-2">
  <span class="text-xs font-medium text-muted-foreground">{label}</span>
  {@render children()}
  {#if hint}
    <span class="block text-[11px] leading-relaxed text-muted-foreground/80">
      {hint}
    </span>
  {/if}
</label>
