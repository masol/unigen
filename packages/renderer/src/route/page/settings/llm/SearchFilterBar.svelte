<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { ALL_ABILITIES, tagIcons, tagLabels } from "$lib/utils/model/types";
  import { IconFilterOff, IconSearch, IconX } from "@tabler/icons-svelte";
  import { searchStore } from "./searchstore.svelte";

  let {
    filteredProviderCount = 0,
    filteredModelCount = 0,
  }: {
    filteredProviderCount?: number;
    filteredModelCount?: number;
  } = $props();

  const abilities = ALL_ABILITIES;
</script>

<div
  class="space-y-4 rounded-2xl border border-border/50 bg-card p-6 shadow-sm"
>
  <!-- 搜索输入 -->
  <div class="relative">
    <IconSearch
      size={16}
      stroke={1.5}
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      value={searchStore.searchQuery}
      oninput={(e: Event) => {
        searchStore.searchQuery = (e.currentTarget as HTMLInputElement).value;
      }}
      placeholder="搜索提供商或模型名称 / ID"
      class="rounded-xl pl-9 pr-9"
    />
    {#if searchStore.searchQuery}
      <button
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
        onclick={() => {
          searchStore.searchQuery = "";
        }}
        type="button"
        aria-label="清除搜索"
      >
        <IconX size={14} stroke={1.5} />
      </button>
    {/if}
  </div>

  <!-- 能力筛选芯片 -->
  <div class="flex flex-wrap items-center gap-2">
    <span class="mr-1 text-xs text-muted-foreground">标签筛选(或)</span>
    {#each abilities as ability (ability)}
      {@const AbIcon = tagIcons[ability]}
      {@const active = searchStore.activeAbilityFilters.includes(ability)}
      <button
        type="button"
        aria-pressed={active}
        class={[
          "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all duration-200",
          active
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border/50 bg-background text-muted-foreground hover:bg-muted",
        ]}
        onclick={() => searchStore.toggleAbilityFilter(ability)}
      >
        <AbIcon size={12} stroke={1.5} />
        {tagLabels[ability]}
      </button>
    {/each}
    {#if searchStore.isFiltering}
      <button
        type="button"
        class="ml-2 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
        onclick={() => searchStore.clearAllFilters()}
      >
        <IconFilterOff size={12} stroke={1.5} />
        清除
      </button>
    {/if}
  </div>

  <!-- 筛选结果统计 -->
  {#if searchStore.isFiltering}
    <p class="animate-fade-in text-xs text-muted-foreground">
      找到 {filteredProviderCount} 个提供商，{filteredModelCount} 个模型
    </p>
  {/if}
</div>
