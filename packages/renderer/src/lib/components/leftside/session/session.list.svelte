<!-- packages/renderer/src/lib/components/leftside/session/session.list.svelte -->
<script lang="ts">
  import type { ChatSession } from "$lib/store/local/chat.types";
  import type { TimeGroup } from "$lib/store/local/session.store.svelte";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import VirtualList from "@humanspeak/svelte-virtual-list";
  import { onMount } from "svelte";
  import SessionEmpty from "./session.empty.svelte";
  import SessionGroup from "./session.group.svelte";
  import SessionItem from "./session.item.svelte";
  import SessionSkeleton from "./session.skeleton.svelte";

  import { push, router } from "svelte-spa-router";

  type VirtualListItem =
    | { type: "group"; data: TimeGroup }
    | { type: "session"; data: ChatSession };

  // 超过此阈值启用虚拟滚动
  const VIRTUALIZATION_THRESHOLD = 100;
  // 单行条目 36px + 分组标题约 32px 的加权均值；
  // 库会在首次渲染后用真实测量值自动替换
  const ESTIMATED_ITEM_SIZE = 38;
  // 约 2 屏预渲染，兼顾内存与滚动平滑度
  const BUFFER_SIZE = 30;

  const shouldVirtualize = $derived(
    sessionStore.sessions.length >= VIRTUALIZATION_THRESHOLD,
  );

  const flattenedItems = $derived.by((): VirtualListItem[] => {
    const items: VirtualListItem[] = [];

    for (const group of sessionStore.groupedSessions) {
      items.push({ type: "group", data: group });
      for (const session of group.sessions) {
        items.push({ type: "session", data: session });
      }
    }

    return items;
  });

  function getItemKey(item: VirtualListItem): string {
    return item.type === "group"
      ? `group-${item.data.id}`
      : `session-${item.data.id}`;
  }

  onMount(() => {
    if (router.location !== "/") {
      push("/");
    }
  });
</script>

<div class="flex h-full min-w-0 flex-col">
  <nav class="min-w-0 flex-1 overflow-hidden">
    {#if sessionStore.isLoadingInit}
      <div class="h-full overflow-y-auto overflow-x-hidden px-3 py-3">
        <SessionSkeleton />
      </div>
    {:else if sessionStore.groupedSessions.length === 0}
      <div class="h-full overflow-y-auto overflow-x-hidden px-3 py-3">
        <SessionEmpty />
      </div>
    {:else if shouldVirtualize}
      <!-- overflow-hidden 外层兜底：即便内部测量出现瞬时偏差，也不会冒横向滚动条 -->
      <div class="h-full min-w-0 overflow-hidden">
        <VirtualList
          items={flattenedItems}
          itemKey={getItemKey}
          defaultEstimatedItemSize={ESTIMATED_ITEM_SIZE}
          bufferSize={BUFFER_SIZE}
          contentClass="min-w-0 px-3 py-2"
        >
          {#snippet renderItem(item: VirtualListItem)}
            {#if item.type === "group"}
              <SessionGroup group={item.data} />
            {:else}
              <div class="pb-0.5">
                <SessionItem session={item.data} />
              </div>
            {/if}
          {/snippet}
        </VirtualList>
      </div>
    {:else}
      <div class="h-full min-w-0 overflow-x-hidden overflow-y-auto px-3 py-2">
        <div class="min-w-0 space-y-0.5" use:autoAnimate>
          {#each flattenedItems as item (getItemKey(item))}
            {#if item.type === "group"}
              <SessionGroup group={item.data} />
            {:else}
              <SessionItem session={item.data} />
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </nav>
</div>
