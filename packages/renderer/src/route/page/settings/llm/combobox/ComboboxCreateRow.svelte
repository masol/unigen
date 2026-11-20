<!-- ComboboxCreateRow.svelte -->
<!-- 列表尾部的"使用 xxx"项：让用户明确看到自由输入可以被采用。 -->
<script lang="ts">
  import { cn } from "$lib/utils";
  import { IconPlus } from "@tabler/icons-svelte";

  type Props = {
    query: string;
    active?: boolean;
    elementRef?: (el: HTMLElement | undefined) => void;
    onSelect?: () => void;
    onHover?: () => void;
  };

  let {
    query,
    active = false,
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
  <IconPlus
    size={16}
    stroke={1.5}
    class="shrink-0 text-emerald-600 dark:text-emerald-400"
  />
  <p class="min-w-0 flex-1 truncate">
    使用 "
    <span class="font-mono font-medium">{query}</span>
    "
  </p>
</div>
