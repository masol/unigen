<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { IconLoader2 } from "@tabler/icons-svelte";

  let {
    canLoadMore = false,
    loadingMore = false,
    hidden = false,
    totalLoaded,
    scrollRoot = null,
    onLoadMore,
  }: {
    canLoadMore?: boolean;
    loadingMore?: boolean;
    /** 遮罩期间隐藏分页栏，避免与遮罩叠层的视觉噪音。 */
    hidden?: boolean;
    totalLoaded?: number;
    /** 滚动容器，用作 IntersectionObserver 的 root；不传则退化为仅按钮模式。 */
    scrollRoot?: HTMLElement | null;
    onLoadMore?: () => void;
  } = $props();

  let sentinel = $state<HTMLDivElement | null>(null);
  let sentinelVisible = $state(false);

  // 哨兵挂载 + 有滚动容器时才建立观察者；hidden 时哨兵被移除，
  // bind:this 变 null 触发清理。
  $effect(() => {
    if (!sentinel || !scrollRoot) return;

    const observer = new IntersectionObserver(
      (entries) => {
        sentinelVisible = entries.some((entry) => entry.isIntersecting);
      },
      { root: scrollRoot, rootMargin: "320px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  // 哨兵可见且还有更多 → 自动续加载。
  // 使用 effect 而非纯回调，是为了覆盖「加载完成后哨兵仍留在视口内」
  // 这种 IntersectionObserver 不会再次回调的场景（无限滚动语义）。
  $effect(() => {
    if (sentinelVisible && canLoadMore && !loadingMore && !hidden) {
      onLoadMore?.();
    }
  });
</script>

{#if hidden}
  <!-- 遮罩期间静默 -->
{:else if canLoadMore}
  <div bind:this={sentinel} class="flex justify-center pt-2">
    {#if loadingMore}
      <span
        class="inline-flex items-center gap-2 text-xs text-muted-foreground"
      >
        <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
        正在加载更多…
      </span>
    {:else}
      <Button
        variant="outline"
        size="sm"
        class="rounded-xl text-xs"
        onclick={() => onLoadMore?.()}
      >
        加载更多
      </Button>
    {/if}
  </div>
{:else if typeof totalLoaded === "number" && totalLoaded > 0}
  <p class="pt-2 text-center text-xs text-muted-foreground">
    已加载全部 {totalLoaded} 个
  </p>
{/if}
