<script lang="ts" generics="T">
  import { BlockUi } from "$lib/components/ui/block-ui";
  import autoAnimate from "@formkit/auto-animate";
  import type { Snippet } from "svelte";
  import SkillPaginationFooter from "./SkillPaginationFooter.svelte";

  let {
    items,
    itemKey,
    blocking = false,
    message = "正在加载…",
    canLoadMore = false,
    loadingMore = false,
    totalLoaded,
    scrollRoot = null,
    onLoadMore,
    card,
  }: {
    items: T[];
    itemKey: (item: T) => string | number;
    /** 冻结状态：遮罩阻止交互，列表保持旧内容直到数据返回后整体切换。 */
    blocking?: boolean;
    message?: string;
    canLoadMore?: boolean;
    loadingMore?: boolean;
    totalLoaded?: number;
    scrollRoot?: HTMLElement | null;
    onLoadMore?: () => void;
    card: Snippet<[T]>;
  } = $props();
</script>

<div class="space-y-4">
  <!--
    BlockUi 包裹网格，遮罩只覆盖网格区域（非全屏）。
    - blocking=false 时完全不渲染遮罩，不影响正常浏览。
    - blocking=true 时冻结旧内容，服务端返回后由 autoAnimate 补间切换。
    - opacity 越高遮挡越强；blur 强调“背后内容即将变化”。
  -->
  <BlockUi {blocking} {message} opacity={50} blur>
    <div
      class={[
        "grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
        // 空数据 + 遮罩时给网格最小高度，保证遮罩有可见区域
        items.length === 0 && blocking ? "min-h-40" : "",
      ]}
      use:autoAnimate
    >
      {#each items as item (itemKey(item))}
        {@render card(item)}
      {/each}
    </div>
  </BlockUi>

  {#if items.length > 0}
    <SkillPaginationFooter
      {canLoadMore}
      {loadingMore}
      {totalLoaded}
      {scrollRoot}
      hidden={blocking}
      {onLoadMore}
    />
  {/if}
</div>
