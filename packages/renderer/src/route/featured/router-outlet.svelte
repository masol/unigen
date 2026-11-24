<!-- src/route/featured/router-outlet.svelte -->
<script lang="ts">
  interface Props {
    /**
     * 稳定的 Router 宿主元素（外部持有，本组件只负责搬运）。
     * 挂载时把 source 搬到本组件内部；卸载时归还到原父级。
     *
     * 注意：source 自身必须携带 h-full / w-full / overflow-hidden
     * 之类的布局语义（本组件的 dst 只负责"给一个确定高度"），
     * 否则会出现 Router 内部 h-full 链条断裂 → 无滚动条。
     */
    source: HTMLElement | undefined;
  }

  let { source }: Props = $props();

  let host = $state<HTMLDivElement>();

  $effect(() => {
    const src = source;
    const dst = host;
    if (!src || !dst) return;

    const originalParent = src.parentNode as HTMLElement | null;

    // 显示 + 移动到 dst。class 不动（保留 h-full / w-full / overflow-hidden）。
    src.classList.remove("hidden");
    dst.appendChild(src);

    return () => {
      // 顺序很重要：先从 dst 剥离，避免随 dst 一起被 Svelte 删除；
      // 再隐藏、归还到原父级，让下一次挂载可以直接接续。
      if (src.parentNode === dst) {
        dst.removeChild(src);
      }
      src.classList.add("hidden");

      if (originalParent?.isConnected) {
        originalParent.appendChild(src);
      }
    };
  });
</script>

<!-- 只提供"确定高度"约束；尺寸 + overflow 语义都在 source(routerHost) 上 -->
<div bind:this={host} class="h-full w-full"></div>
