<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { Snippet } from "svelte";
  import EmptyState from "./EmptyState.svelte";
  import ProjectTypeCard from "./ProjectTypeCard.svelte";
  import { SKELETON_COUNT } from "./constants";
  import type { ProjectType } from "./types";

  type Props = {
    isLoading: boolean;
    items: ProjectType[];
    hasQuery: boolean;
    deletingId?: string | null;
    onUninstall?: (type: ProjectType) => void;
    emptyAction?: Snippet; // 空态下的额外操作
  };
  let {
    isLoading,
    items,
    hasQuery,
    deletingId = null,
    onUninstall,
    emptyAction,
  }: Props = $props();

  const GRID =
    "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
</script>

{#if isLoading}
  <div class={GRID}>
    {#each Array(SKELETON_COUNT) as _, i (i)}
      <Skeleton class="h-36 rounded-2xl" />
    {/each}
  </div>
{:else if items.length === 0}
  <EmptyState
    title={hasQuery ? "没有匹配的项目类型" : "尚未安装任何项目类型"}
    description={hasQuery
      ? "换个关键词试试。"
      : "在「在线获取」中浏览安装,或把插件放入插件目录后点击刷新。"}
  >
    {#if emptyAction}{@render emptyAction()}{/if}
  </EmptyState>
{:else}
  <div class={GRID}>
    {#each items as type (type.id)}
      <ProjectTypeCard
        {type}
        deleting={deletingId === type.id}
        onUninstall={() => onUninstall?.(type)}
      />
    {/each}
  </div>
{/if}
