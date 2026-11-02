<!-- 消息列表：满幅滚动容器 + 不对称左右留白 + 回到底部悬浮按钮 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { IconArrowDown } from "@tabler/icons-svelte";
  import { onMount, tick } from "svelte";
  import AssistantMessage from "./messages/AssistantMessage.svelte";
  import EmptyState from "./messages/EmptyState.svelte";
  import UserMessage from "./messages/UserMessage.svelte";

  let scrollContainer = $state<HTMLDivElement | null>(null);
  let userScrolledUp = $state(false);
  let unreadCount = $state(0);
  let scrollDebounce: ReturnType<typeof setTimeout> | null = null;
  let prevMessageCount = $state(0);

  function scrollToBottom(smooth = false) {
    if (!scrollContainer) return;
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  function handleScroll() {
    if (!scrollContainer) return;
    if (scrollDebounce) clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      if (!scrollContainer) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const atBottom = scrollHeight - scrollTop - clientHeight <= 120;
      userScrolledUp = !atBottom;
      if (atBottom) unreadCount = 0;
    }, 80);
  }

  // 滚动跟随策略：
  //  - 用户新消息入场 → 平滑滚底，重置 userScrolledUp（显式"看最新"）
  //  - 助手新消息（且已滚离底部） → 不打扰，unread++
  //  - 流式增长 → auto 定位（smooth 会被反复打断）
  //  - 用户主动向上滚 → 不打扰
  $effect(() => {
    const length = messageStore.messages.length;
    const streaming = messageStore.isLoading;
    const last = messageStore.messages.at(-1);
    void last?.content;
    void last?.traces?.length;

    const isNewMessage = length > prevMessageCount;
    const isNewFromUser = isNewMessage && last?.role === "user";
    prevMessageCount = length;

    tick().then(() => {
      if (!scrollContainer) return;

      if (isNewFromUser) {
        userScrolledUp = false;
        unreadCount = 0;
      }

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const atBottom = scrollHeight - scrollTop - clientHeight <= 120;

      if (userScrolledUp && !atBottom) {
        if (isNewMessage) unreadCount++;
        return;
      }

      requestAnimationFrame(() => scrollToBottom(isNewMessage && !streaming));
    });
  });

  function jumpToBottom() {
    userScrolledUp = false;
    unreadCount = 0;
    scrollToBottom(true);
  }

  // "回到底部"按钮条件：有消息 + 用户滚离底部
  let showJumpButton = $derived(
    userScrolledUp && messageStore.messages.length > 0,
  );

  onMount(() => scrollToBottom(false));
</script>

<div class="relative h-full w-full">
  <div
    bind:this={scrollContainer}
    onscroll={handleScroll}
    class="chat-scroll h-full w-full overflow-y-auto"
  >
    {#if messageStore.messages.length === 0}
      <EmptyState />
    {:else}
      <ul class="flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {#each messageStore.messages as message (message.id)}
          <li class="min-w-0">
            {#if message.role === "user"}
              <!-- 用户：右对齐 + 左侧强制留白 -->
              <div class="flex justify-end pl-10 sm:pl-20 md:pl-32">
                <div class="w-fit max-w-2xl">
                  <UserMessage {message} />
                </div>
              </div>
            {:else}
              <!-- AI：填满可用宽度 + 右侧小留白 -->
              <div class="pr-6 sm:pr-10 lg:pr-16">
                <AssistantMessage {message} />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if showJumpButton}
    <div class="pointer-events-none absolute bottom-4 right-4 animate-slide-up">
      <Button
        variant="secondary"
        size="sm"
        onclick={jumpToBottom}
        class="pointer-events-auto gap-2 rounded-xl border border-border/50 shadow-xl backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5"
        aria-label={unreadCount > 0
          ? `${unreadCount} 条新消息，点击跳到底部`
          : "回到底部"}
      >
        <IconArrowDown size={14} stroke={1.5} />
        {#if unreadCount > 0}
          <span class="font-medium">{unreadCount} 条新消息</span>
        {:else}
          <span>回到底部</span>
        {/if}
      </Button>
    </div>
  {/if}
</div>

<style>
  /* 跨浏览器 scrollbar 样式 · Tailwind 当前无等价工具类 */
  .chat-scroll {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
  }
  .chat-scroll::-webkit-scrollbar {
    width: 8px;
  }
  .chat-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .chat-scroll::-webkit-scrollbar-thumb {
    background-color: hsl(var(--muted-foreground) / 0.3);
    border-radius: 12px;
  }
  .chat-scroll::-webkit-scrollbar-thumb:hover {
    background-color: hsl(var(--muted-foreground) / 0.5);
  }
</style>
