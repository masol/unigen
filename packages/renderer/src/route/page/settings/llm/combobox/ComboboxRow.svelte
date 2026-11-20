<!-- ComboboxRow.svelte -->
<!-- 单个可点击行。active 由父级 activeIndex 驱动，hover 与键盘共用同一状态。 -->
<script lang="ts">
  import { cn } from "$lib/utils";
  import { IconCheck } from "@tabler/icons-svelte";
  import type { ComboboxItem } from "./combobox.types";

  type Props = {
    item: ComboboxItem;
    active?: boolean;
    selected?: boolean;
    elementRef?: (el: HTMLElement | undefined) => void;
    onSelect?: () => void;
    onHover?: () => void;
  };

  let {
    item,
    active = false,
    selected = false,
    elementRef,
    onSelect,
    onHover,
  }: Props = $props();

  let el: HTMLDivElement | undefined = $state();
  $effect(() => {
    elementRef?.(el);
  });
</script>

<div
  bind:this={el}
  role="option"
  aria-selected={active}
  tabindex="-1"
  data-active={active ? "true" : undefined}
  onpointerenter={() => onHover?.()}
  onpointerdown={(e) => {
    e.preventDefault();
    onSelect?.();
  }}
  class={cn(
    "flex cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none",
    "transition-colors duration-100",
    active ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
  )}
>
  <div class="min-w-0 flex-1 space-y-0.5">
    <p class="truncate text-sm font-medium">{item.label}</p>
    {#if item.description}
      <p class="truncate text-xs text-muted-foreground">{item.description}</p>
    {/if}
  </div>
  {#if selected}
    <IconCheck size={16} stroke={1.5} class="ml-auto shrink-0 text-primary" />
  {/if}
</div>
