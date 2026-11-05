<!-- packages/renderer/src/lib/components/leftside/session/session.list.svelte -->
<script lang="ts">
  import { Separator } from "$lib/components/ui/separator";
  import type { ChatSession } from "$lib/store/local/chat.types";
  import type { TimeGroup } from "$lib/store/local/session.store.svelte";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import VirtualList from "@humanspeak/svelte-virtual-list";
  import { SvelteSet } from "svelte/reactivity";
  import SessionEmpty from "./session.empty.svelte";
  import SessionGroup from "./session.group.svelte";
  import SessionItem from "./session.item.svelte";
  import SessionSkeleton from "./session.skeleton.svelte";

  type VirtualListItem =
    | { type: "group"; data: TimeGroup }
    | { type: "session"; data: ChatSession }
    | { type: "separator"; id: string };

  // 超过此阈值启用虚拟滚动
  const VIRTUALIZATION_THRESHOLD = 100;
  // 初始尺寸估算（group 48 / session 72 / separator 20 的加权均值），
  // 库会在首次渲染后用真实测量值自动替换
  const ESTIMATED_ITEM_SIZE = 60;
  // 72px 条目下约 2 屏预渲染，兼顾内存与滚动平滑度
  const BUFFER_SIZE = 30;

  // 折叠态由列表层维护，被折叠的 group 其 sessions 不入列，
  // 从源头规避 VirtualList 内部的高度突变。
  //
  // 注意：$state(new Set()) 并不会让 Set 成为响应式代理——Svelte 5 的 $state
  // 只深度代理普通对象和数组，Map/Set/Date 等内置类型需要 SvelteSet /
  // SvelteMap。原生 Set 上的 add/delete 无法触发依赖追踪，因此用 SvelteSet。
  const collapsedGroups = new SvelteSet<string>();

  const shouldVirtualize = $derived(
    sessionStore.sessions.length >= VIRTUALIZATION_THRESHOLD,
  );

  const flattenedItems = $derived.by((): VirtualListItem[] => {
    const items: VirtualListItem[] = [];

    sessionStore.groupedSessions.forEach((group, index) => {
      if (index > 0) {
        items.push({ type: "separator", id: `sep-${group.id}` });
      }
      items.push({ type: "group", data: group });

      if (!collapsedGroups.has(group.id)) {
        group.sessions.forEach((session) => {
          items.push({ type: "session", data: session });
        });
      }
    });

    return items;
  });

  function getItemKey(item: VirtualListItem): string {
    if (item.type === "group") return `group-${item.data.id}`;
    if (item.type === "session") return `session-${item.data.id}`;
    return item.id;
  }

  function isGroupOpen(id: string): boolean {
    return !collapsedGroups.has(id);
  }

  function toggleGroup(id: string): void {
    if (collapsedGroups.has(id)) collapsedGroups.delete(id);
    else collapsedGroups.add(id);
  }
</script>

<div class="flex h-full flex-col">
  <nav class="flex-1 overflow-hidden">
    {#if sessionStore.isLoadingInit}
      <div class="h-full overflow-y-auto px-3 py-3">
        <SessionSkeleton />
      </div>
    {:else if sessionStore.groupedSessions.length === 0}
      <div class="h-full overflow-y-auto px-3 py-3">
        <SessionEmpty />
      </div>
    {:else if shouldVirtualize}
      <VirtualList
        items={flattenedItems}
        itemKey={getItemKey}
        defaultEstimatedItemSize={ESTIMATED_ITEM_SIZE}
        bufferSize={BUFFER_SIZE}
        contentClass="px-3 py-3"
      >
        {#snippet renderItem(item: VirtualListItem)}
          {#if item.type === "separator"}
            <div class="px-2 py-2">
              <Separator class="bg-border/40" />
            </div>
          {:else if item.type === "group"}
            <SessionGroup
              group={item.data}
              isOpen={isGroupOpen(item.data.id)}
              onToggle={() => toggleGroup(item.data.id)}
            />
          {:else}
            <SessionItem session={item.data} />
          {/if}
        {/snippet}
      </VirtualList>
    {:else}
      <div class="h-full overflow-y-auto px-3 py-3">
        <div class="space-y-1" use:autoAnimate>
          {#each flattenedItems as item (getItemKey(item))}
            {#if item.type === "separator"}
              <div class="px-2 py-2">
                <Separator class="bg-border/40" />
              </div>
            {:else if item.type === "group"}
              <SessionGroup
                group={item.data}
                isOpen={isGroupOpen(item.data.id)}
                onToggle={() => toggleGroup(item.data.id)}
              />
            {:else}
              <SessionItem session={item.data} />
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </nav>
</div>
