<!-- 消息列表：虚拟滚动 + 自动跟随底部 + DOM 测量式 scrollspy + 比例兜底 + 底部居中"回到底部"按钮 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import SvelteVirtualChat from "@humanspeak/svelte-virtual-chat";
  import { IconArrowDown } from "@tabler/icons-svelte";
  import { tick } from "svelte";
  import MessageMinimap from "./MessageMinimap.svelte";
  import AssistantMessage from "./messages/AssistantMessage.svelte";
  import EmptyState from "./messages/EmptyState.svelte";
  import UserMessage from "./messages/UserMessage.svelte";

  let chat: ReturnType<typeof SvelteVirtualChat> | undefined = $state();
  let wrapperEl = $state<HTMLElement>();
  let following = $state(true);
  let prevCount = 0;

  // ── Scrollspy 原始量（getDebugInfo 用于回底按钮判断 + 比例兜底）──────
  let scrollTop = $state(0);
  let viewportHeight = $state(0);
  let totalHeight = $state(0);

  // ── DOM 测量 activeId（主路径）──────────────────────────
  let measuredActiveId = $state<string | undefined>(undefined);

  // ── 比例兜底 activeId（DOM 测量不可用时使用）────────────
  let fallbackActiveId = $derived.by(() => {
    const msgs = messageStore.messages;
    if (msgs.length === 0) return undefined;
    const total = msgs.length;

    const dist =
      totalHeight > 0 && viewportHeight > 0
        ? totalHeight - scrollTop - viewportHeight
        : 0;

    let idx: number;
    if (dist <= 28) {
      idx = total - 1;
    } else if (totalHeight > 0 && viewportHeight > 0) {
      const ratio = Math.min(1, (scrollTop + viewportHeight) / totalHeight);
      idx = Math.floor(ratio * total);
    } else {
      idx = 0;
    }
    idx = Math.max(0, Math.min(total - 1, idx));
    for (let i = idx; i >= 0; i--) {
      if ((msgs[i]?.content ?? "").trim().length > 0) return msgs[i].id;
    }
    return msgs[0]?.id;
  });

  let activeId = $derived(
    (measuredActiveId ?? fallbackActiveId) as string | undefined,
  );

  function measureActiveId() {
    const wrapper = wrapperEl;
    if (!wrapper) return;
    const viewport = wrapper.querySelector(
      ".chat-scroll",
    ) as HTMLElement | null;
    if (!viewport) return;

    const viewRect = viewport.getBoundingClientRect();
    const nodes = viewport.querySelectorAll<HTMLElement>("[data-message-id]");
    if (nodes.length === 0) return;

    let bestId: string | undefined;
    let bestTop = -Infinity;
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      if (r.bottom <= viewRect.top) continue;
      if (r.top >= viewRect.bottom) continue;
      if (r.top > bestTop) {
        bestTop = r.top;
        bestId = node.dataset.messageId;
      }
    }

    if (bestId) measuredActiveId = bestId;
  }

  $effect(() => {
    if (!chat) return;

    const runOnce = () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = chat as any;
        const info =
          typeof api?.getDebugInfo === "function" ? api.getDebugInfo() : null;
        if (info) {
          scrollTop = info.scrollTop;
          viewportHeight = info.viewportHeight;
          totalHeight = info.totalHeight;
          if (info.isFollowingBottom !== following) {
            following = info.isFollowingBottom;
          }
        }
      } catch {
        // 静默退化到纯 DOM 测量
      }
      measureActiveId();
    };

    runOnce();
    const id = setInterval(runOnce, 120);
    return () => clearInterval(id);
  });

  let msgSig = $derived.by(() => {
    const m = messageStore.messages;
    const last = m[m.length - 1];
    return `${m.length}:${last?.id ?? ""}`;
  });
  $effect(() => {
    void msgSig;
    tick().then(measureActiveId);
  });

  let distanceFromBottom = $derived(
    Math.max(0, totalHeight - scrollTop - viewportHeight),
  );

  $effect(() => {
    const len = messageStore.messages.length;
    const last = messageStore.messages.at(-1);
    if (len > prevCount && last?.role === "user") {
      following = true;
      tick().then(() => chat?.scrollToBottom({ smooth: true }));
    }
    prevCount = len;
  });

  let showJumpButton = $derived(
    messageStore.messages.length > 0 && !following && distanceFromBottom > 200,
  );

  let showMinimap = $derived.by(() => {
    const hasNonEmpty = messageStore.messages.some(
      (m) => (m.content ?? "").trim().length > 0,
    );
    if (!hasNonEmpty) return false;
    if (viewportHeight <= 0 || totalHeight <= 0) return false;
    return totalHeight > viewportHeight * 1.05;
  });

  /**
   * 跳转到指定消息。
   *
   * 修复要点：流式输出期间，SvelteVirtualChat 持续测量高度、重排布局；
   * smooth 滚动极易被 follow-bottom 或重新定位打断，表现为「跳一点点就停」。
   * 因此：
   * - 使用 `smooth: false`（instant 定位）避免动画被吞；
   * - 主动置 `following = false`，即使落点距底 ≤ 48px 也不被后续流式 update 拉回；
   * - 通过`estimatedMessageHeight` 提升缓存外的消息高度估计精度（见模板），
   *   避免因历史长消息按 120px 低估导致目标 offset 严重偏小。
   */
  function scrollToMessage(id: string) {
    if (!chat) return;
    following = false;
    chat.scrollToMessage(id, { smooth: false });
  }

  function jumpToBottom() {
    following = true;
    chat?.scrollToBottom({ smooth: true });
  }

  function errorText(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
</script>

<div class="relative h-full w-full" bind:this={wrapperEl}>
  {#if messageStore.messages.length === 0}
    <EmptyState />
  {:else}
    <SvelteVirtualChat
      bind:this={chat}
      messages={messageStore.messages}
      getMessageId={(msg) => msg.id}
      estimatedMessageHeight={280}
      followBottomThresholdPx={24}
      containerClass="h-full"
      viewportClass="h-full chat-scroll"
      onFollowBottomChange={(v) => (following = v)}
      onDebugInfo={(info) => {
        scrollTop = info.scrollTop;
        viewportHeight = info.viewportHeight;
        totalHeight = info.totalHeight;
        measureActiveId();
      }}
    >
      {#snippet renderMessage(message, _index)}
        <div class="px-4 py-3 sm:px-6 lg:px-8" data-message-id={message.id}>
          <svelte:boundary>
            {#if message.role === "user"}
              <div class="flex justify-end pl-10 sm:pl-20 md:pl-32">
                <div class="w-fit max-w-2xl">
                  <UserMessage {message} />
                </div>
              </div>
            {:else}
              <div class="pr-6 sm:pr-10 lg:pr-16">
                <AssistantMessage {message} />
              </div>
            {/if}

            {#snippet failed(error, reset)}
              <div
                class="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs"
              >
                <p class="font-medium text-destructive">消息渲染出错</p>
                <p
                  class="mt-1 leading-relaxed text-muted-foreground wrap-break-word"
                >
                  {errorText(error)}
                </p>
                <button
                  type="button"
                  onclick={reset}
                  class="mt-2 text-xs text-destructive underline"
                >
                  重试
                </button>
              </div>
            {/snippet}
          </svelte:boundary>
        </div>
      {/snippet}
    </SvelteVirtualChat>
  {/if}

  <MessageMinimap visible={showMinimap} {activeId} onSelect={scrollToMessage} />

  {#if showJumpButton}
    <div
      class="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 animate-slide-up"
    >
      <Button
        variant="secondary"
        size="icon"
        onclick={jumpToBottom}
        class="pointer-events-auto size-10 rounded-full border border-border/50 shadow-lg backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-95"
        aria-label="回到底部"
        title="回到底部"
      >
        <IconArrowDown size={18} stroke={1.5} />
      </Button>
    </div>
  {/if}
</div>

<style>
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
