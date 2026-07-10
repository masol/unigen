<script lang="ts" generics="T">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { Snippet } from "svelte";
  let {
    items,
    columns = 10,
    rowHeight = 104,
    gap = 24,
    overscan = 3,
    cell,
    loading = false,
  }: {
    items: T[];
    columns?: number;
    rowHeight?: number;
    gap?: number;
    overscan?: number;
    cell: Snippet<[T]>;
    loading?: boolean;
  } = $props();
  let viewport = $state<HTMLDivElement | null>(null);
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  const rowStride = $derived(rowHeight + gap);
  const totalRows = $derived(Math.ceil(items.length / columns));
  const totalHeight = $derived(totalRows * rowStride - gap);
  const startRow = $derived(
    Math.max(0, Math.floor(scrollTop / rowStride) - overscan),
  );
  const visibleRows = $derived(
    Math.ceil(viewportHeight / rowStride) + overscan * 2,
  );
  const endRow = $derived(Math.min(totalRows, startRow + visibleRows));
  const slice = $derived.by(() => {
    const from = startRow * columns;
    const to = Math.min(items.length, endRow * columns);
    return items.slice(from, to).map((item, i) => ({ item, index: from + i }));
  });
  const offsetY = $derived(startRow * rowStride);
  function onScroll() {
    if (viewport) scrollTop = viewport.scrollTop;
  }
  $effect(() => {
    if (!viewport) return;
    const ro = new ResizeObserver(() => {
      if (viewport) viewportHeight = viewport.clientHeight;
    });
    ro.observe(viewport);
    viewportHeight = viewport.clientHeight;
    return () => ro.disconnect();
  });
</script>

<div
  bind:this={viewport}
  onscroll={onScroll}
  class="scrollbar-thin h-full w-full overflow-y-auto"
>
  {#if loading}
    <div
      class="grid gap-6 p-1"
      style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
    >
      {#each Array(columns * 6) as _, i (i)}
        <Skeleton class="aspect-square rounded-2xl" />
      {/each}
    </div>
  {:else}
    <div style:height="{totalHeight}px" style:position="relative">
      <div
        style:transform="translateY({offsetY}px)"
        style:position="absolute"
        style:top="0"
        style:left="0"
        style:right="0"
        class="grid gap-6"
        style:grid-template-columns="repeat({columns}, minmax(0, 1fr))"
        style:row-gap="{gap}px"
      >
        {#each slice as entry (entry.index)}
          {@render cell(entry.item)}
        {/each}
      </div>
    </div>
  {/if}
</div>
