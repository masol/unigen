<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconCheck,
    IconChevronRight,
    IconCircle,
    IconLoader2,
    IconSearch,
    IconX,
  } from "@tabler/icons-svelte";
  import { slide } from "svelte/transition";
  import type { PickerItem, PickerSource } from "./pac-meta-tools-store.svelte";

  let {
    source,
    selectedIds = [],
    builtinItems = [],
    toggleFn = () => {},
    placeholder,
    emptyLabel,
  }: {
    source: PickerSource;
    selectedIds: string[];
    builtinItems?: PickerItem[];
    toggleFn: (id: string) => void;
    placeholder: string;
    emptyLabel: string;
  } = $props();

  let builtinOpen = $state(true);

  let builtinIdSet = $derived(new Set(builtinItems.map((it) => it.id)));

  let availableBuiltins = $derived.by<PickerItem[]>(() => {
    if (builtinItems.length === 0) return [];
    const q = source.query.trim().toLowerCase();
    return builtinItems.filter((it) => {
      if (selectedIds.includes(it.id)) return false;
      if (!q) return true;
      const name = (it.name ?? it.title ?? it.label ?? it.id).toLowerCase();
      const desc = (it.description ?? it.desc ?? "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  });

  let availableItems = $derived(
    source.items.filter(
      (it) => !selectedIds.includes(it.id) && !builtinIdSet.has(it.id),
    ),
  );

  let showEmpty = $derived(
    !source.loading &&
      !source.error &&
      selectedIds.length === 0 &&
      availableBuiltins.length === 0 &&
      availableItems.length === 0,
  );

  let showDynamicHeader = $derived(
    selectedIds.length > 0 || availableBuiltins.length > 0,
  );

  function resolveName(item: PickerItem): string {
    return item.name ?? item.title ?? item.label ?? item.id;
  }
</script>

{#snippet sectionHeader(
  label: string,
  count: number,
  open: boolean,
  onToggle: () => void,
)}
  <button
    type="button"
    onclick={onToggle}
    aria-expanded={open}
    class="flex w-full items-center gap-1 rounded-md px-2 pt-1 pb-1.5 text-left transition-colors hover:bg-accent/40"
  >
    <IconChevronRight
      size={10}
      stroke={2.5}
      class="shrink-0 text-muted-foreground/70 transition-transform duration-200 {open
        ? 'rotate-90'
        : ''}"
    />
    <span
      class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
    >
      {label}
      <span class="text-muted-foreground/50">({count})</span>
    </span>
  </button>
{/snippet}

{#snippet itemRow(item: PickerItem, selected: boolean)}
  <button
    type="button"
    onclick={() => toggleFn(item.id)}
    aria-pressed={selected}
    title={item.description ?? item.desc ?? undefined}
    class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
  >
    <span class="mt-0.5 flex size-4 shrink-0 items-center justify-center">
      {#if selected}
        <span
          class="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <IconCheck size={10} stroke={2.5} />
        </span>
      {:else}
        <IconCircle size={14} stroke={1.5} class="text-muted-foreground/50" />
      {/if}
    </span>
    <span class="min-w-0 flex-1">
      <span class="line-clamp-1 text-sm font-medium text-foreground">
        {resolveName(item)}
      </span>
      {#if item.description ?? item.desc}
        <span class="line-clamp-1 text-xs text-muted-foreground">
          {item.description ?? item.desc}
        </span>
      {/if}
    </span>
  </button>
{/snippet}

<div class="space-y-3">
  <div class="relative">
    <IconSearch
      size={14}
      stroke={1.5}
      class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <input
      type="text"
      value={source.query}
      {placeholder}
      aria-label={placeholder}
      oninput={(e) => source.setQuery(e.currentTarget.value)}
      class="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
    {#if source.query}
      <button
        type="button"
        onclick={() => source.setQuery("")}
        class="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="清除筛选"
        title="清除筛选"
      >
        <IconX size={12} stroke={2} />
      </button>
    {/if}
  </div>

  <div class="flex min-h-9 flex-wrap items-center gap-1.5" use:autoAnimate>
    {#if selectedIds.length === 0}
      <span class="text-xs text-muted-foreground">尚未选择任何项</span>
    {:else}
      {#each selectedIds as id (id)}
        {@const item = [...builtinItems, ...source.items].find(
          (it) => it.id === id,
        )}
        {@const label = item ? resolveName(item) : id}
        <button
          type="button"
          onclick={() => toggleFn(id)}
          class="group flex items-center gap-1 rounded-lg border border-border/50 bg-muted/40 py-1 pl-2 pr-1 text-xs text-foreground transition-all duration-200 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
        >
          <span class="max-w-[16rem] truncate">{label}</span>
          <IconX
            size={11}
            stroke={2}
            class="shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
          />
        </button>
      {/each}
    {/if}
  </div>

  <div
    class="relative h-72 overflow-hidden rounded-xl border border-border/50 bg-background"
  >
    {#if source.loading && source.items.length === 0}
      <div class="space-y-2 p-2">
        {#each [0, 1, 2, 3, 4] as key (key)}
          <Skeleton class="h-10 rounded-lg" />
        {/each}
      </div>
    {:else if source.error && source.items.length === 0}
      <div
        class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
      >
        <p class="text-xs text-destructive">{source.error}</p>
        <Button
          variant="outline"
          size="sm"
          class="rounded-lg"
          onclick={() => void source.reload()}
        >
          重试
        </Button>
      </div>
    {:else if showEmpty}
      <div class="flex h-full items-center justify-center px-4 text-center">
        <p class="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    {:else}
      <div
        class="h-full overflow-y-auto overflow-x-hidden p-1.5"
        onscroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
            void source.loadMore();
          }
        }}
      >
        {#if availableBuiltins.length > 0}
          {@render sectionHeader(
            "内建",
            availableBuiltins.length,
            builtinOpen,
            () => (builtinOpen = !builtinOpen),
          )}
          {#if builtinOpen}
            <div transition:slide={{ duration: 200 }} class="overflow-hidden">
              <div class="mb-1 flex flex-col gap-0.5" use:autoAnimate>
                {#each availableBuiltins as item (item.id)}
                  {@render itemRow(item, false)}
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        {#if availableItems.length > 0}
          {#if showDynamicHeader}
            <p
              class="px-2 pt-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
            >
              扩展
            </p>
          {/if}
          <div class="flex flex-col gap-0.5" use:autoAnimate>
            {#each availableItems as item (item.id)}
              {@render itemRow(item, false)}
            {/each}
          </div>
        {/if}

        {#if source.loadingMore}
          <div
            class="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground"
          >
            <IconLoader2 size={13} stroke={1.5} class="animate-spin" />
            加载更多…
          </div>
        {/if}

        {#if source.error && source.items.length > 0}
          <div
            class="flex items-center justify-center gap-2 py-1.5 text-xs text-destructive"
          >
            <span>{source.error}</span>
            <button
              type="button"
              onclick={() => void source.reload()}
              class="underline"
            >
              重试
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
