<!-- MultiToggleGroup.svelte -->
<script lang="ts" generics="T extends string">
  import { cn } from "$lib/utils";
  import { IconCheck } from "@tabler/icons-svelte";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Item = { value: T; label: string; icon?: any };

  type Props = {
    items: Item[];
    selected: T[];
    onToggle: (value: T) => void;
  };

  let { items, selected, onToggle }: Props = $props();

  function isOn(v: T) {
    return selected.includes(v);
  }
</script>

<div class="flex flex-wrap gap-2">
  {#each items as item (item.value)}
    {@const on = isOn(item.value)}
    <button
      type="button"
      onclick={() => onToggle(item.value)}
      class={cn(
        "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-input bg-background text-muted-foreground hover:bg-accent/30",
      )}
    >
      {#if item.icon}
        {@const Icon = item.icon}
        <Icon class="size-4" />
      {/if}
      <span>{item.label}</span>
      {#if on}
        <IconCheck class="size-3.5" />
      {/if}
    </button>
  {/each}
</div>
