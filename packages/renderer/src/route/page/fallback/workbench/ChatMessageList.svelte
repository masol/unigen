<!-- 消息列表：虚拟滚动 + 自动跟随底部 + 轮次快速导航 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import SvelteVirtualChat from "@humanspeak/svelte-virtual-chat";
  import { IconArrowDown } from "@tabler/icons-svelte";
  import { tick } from "svelte";
  import ChatRoundNav, { type RoundEntry } from "./ChatRoundNav.svelte";
  import AssistantMessage from "./messages/AssistantMessage.svelte";
  import EmptyState from "./messages/EmptyState.svelte";
  import UserMessage from "./messages/UserMessage.svelte";

  let chat: ReturnType<typeof SvelteVirtualChat> | undefined = $state();
  let following = $state(true);
  let prevCount = 0;

  // 用户发送新消息时强制回到底部；其余新消息遵循虚拟组件的 follow-bottom 策略。
  $effect(() => {
    const len = messageStore.messages.length;
    const last = messageStore.messages.at(-1);

    if (len > prevCount && last?.role === "user") {
      following = true;
      tick().then(() => chat?.scrollToBottom({ smooth: true }));
    }

    prevCount = len;
  });

  let showJumpButton = $derived(!following && messageStore.messages.length > 0);

  // 从全部消息中抽取「用户轮次」序列，供右侧导航使用
  let rounds = $derived.by<RoundEntry[]>(() => {
    const list: RoundEntry[] = [];
    messageStore.messages.forEach((msg, index) => {
      if (msg.role !== "user") return;
      const flat = msg.content.trim().replace(/\s+/g, " ");
      if (!flat) return;
      list.push({
        id: msg.id,
        index,
        round: list.length + 1,
        preview: flat.length > 30 ? flat.slice(0, 30) + "…" : flat,
      });
    });
    return list;
  });

  /**
   * 跳转到指定轮次。
   * 优先按消息 id 定位（对齐用户可见轮次更稳妥），
   * 若当前版本未暴露 scrollToMessage，则退回按索引定位。
   * 两者的具体 API 名称请对照你所使用的 svelte-virtual-chat 版本；
   * 若签名不同（例如 scrollToIndex({ index, smooth })），在此处微调即可。
   */
  function scrollToRound(round: RoundEntry) {
    const api = chat as unknown as
      | {
          scrollToMessage?: (
            id: string,
            options?: { smooth?: boolean },
          ) => void;
          scrollToIndex?: (
            index: number,
            options?: { smooth?: boolean },
          ) => void;
        }
      | undefined;
    if (!api) return;
    if (typeof api.scrollToMessage === "function") {
      api.scrollToMessage(round.id, { smooth: true });
      return;
    }
    if (typeof api.scrollToIndex === "function") {
      api.scrollToIndex(round.index, { smooth: true });
    }
  }

  function jumpToBottom() {
    following = true;
    chat?.scrollToBottom({ smooth: true });
  }
</script>

<div class="relative h-full w-full">
  {#if messageStore.messages.length === 0}
    <EmptyState />
  {:else}
    <SvelteVirtualChat
      bind:this={chat}
      messages={messageStore.messages}
      getMessageId={(msg) => msg.id}
      estimatedMessageHeight={120}
      followBottomThresholdPx={120}
      containerClass="h-full"
      viewportClass="h-full chat-scroll"
      onFollowBottomChange={(v) => (following = v)}
    >
      {#snippet renderMessage(message, _index)}
        <div class="px-4 py-3 sm:px-6 lg:px-8">
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
        </div>
      {/snippet}
    </SvelteVirtualChat>
  {/if}

  <!-- 轮次快速导航（右侧垂直居中） -->
  <ChatRoundNav {rounds} onSelect={scrollToRound} />

  {#if showJumpButton}
    <div class="pointer-events-none absolute bottom-4 right-4 animate-slide-up">
      <Button
        variant="secondary"
        size="sm"
        onclick={jumpToBottom}
        class="pointer-events-auto gap-2 rounded-xl border border-border/50 shadow-xl backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5"
        aria-label="回到底部"
      >
        <IconArrowDown size={14} stroke={1.5} />
        <span>回到底部</span>
      </Button>
    </div>
  {/if}
</div>

<style>
  /* 跨浏览器 scrollbar 样式 · 由 SvelteVirtualChat 的 viewport 使用 */
  :global(.chat-scroll) {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
  }
  :global(.chat-scroll::-webkit-scrollbar) {
    width: 8px;
  }
  :global(.chat-scroll::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(.chat-scroll::-webkit-scrollbar-thumb) {
    background-color: hsl(var(--muted-foreground) / 0.3);
    border-radius: 12px;
  }
  :global(.chat-scroll::-webkit-scrollbar-thumb:hover) {
    background-color: hsl(var(--muted-foreground) / 0.5);
  }
</style>
