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
  // 用 scrollTop / totalHeight / viewportHeight 的比例映射到消息索引；
  // 只有在"明确到底"、"比例可用"、"初始未知"三种场景；
  // 由于 DOM 测量为主，本兜底只在 DOM 不可用（如极端 DOM 异常）时启用。
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

  // ── 最终 activeId：DOM 测量优先，比例兜底 ─────────────
  let activeId = $derived(
    (measuredActiveId ?? fallbackActiveId) as string | undefined,
  );

  // ── DOM 测量：找出"上边缘最靠下但仍在视口内"的消息 ─────
  // 理由：SvelteVirtualChat 的 startIndex/endIndex 反映的是"渲染范围"，
  // 在消息总数 ≤ 可见+overscan 时会恒等于 [0, total-1]，不携带滚动信息。
  // 因此改为直接读取 DOM（每条消息都渲染了 data-message-id），最为可靠；
  // 若仍有消化不良，仍由 fallbackActiveId（比例）兜底。
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
      if (r.bottom <= viewRect.top) continue; // 完全在视口上方
      if (r.top >= viewRect.bottom) continue; // 完全在视口下方
      // 与视口有交集；取 top 最靠下（即"最下方可见消息"）
      if (r.top > bestTop) {
        bestTop = r.top;
        bestId = node.dataset.messageId;
      }
    }

    if (bestId) measuredActiveId = bestId;
  }

  // ── 双通道刷新：onDebugInfo（精细滚动）+ 120ms 轮询（流式高度增量）─
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
      // 不论 getDebugInfo 是否可用，都尽量做一次 DOM 测量
      measureActiveId();
    };

    runOnce();
    const id = setInterval(runOnce, 120);
    return () => clearInterval(id);
  });

  // ── 消息列表变化（新增/删除/内容更新）时，等 DOM 落定后再测一次 ──
  let msgSig = $derived.by(() => {
    const m = messageStore.messages;
    const last = m[m.length - 1];
    return `${m.length}:${last?.id ?? ""}`;
  });
  $effect(() => {
    void msgSig;
    tick().then(measureActiveId);
  });

  // ── 距底距离（用于回底按钮显现）─────────────────────────
  let distanceFromBottom = $derived(
    Math.max(0, totalHeight - scrollTop - viewportHeight),
  );

  // ── 用户发送新消息时强制回到底部 ──────────────────────
  $effect(() => {
    const len = messageStore.messages.length;
    const last = messageStore.messages.at(-1);
    if (len > prevCount && last?.role === "user") {
      following = true;
      tick().then(() => chat?.scrollToBottom({ smooth: true }));
    }
    prevCount = len;
  });

  // ── "回到底部"按钮：底部居中 · 距底 > 200px 且非 following ──
  let showJumpButton = $derived(
    messageStore.messages.length > 0 && !following && distanceFromBottom > 200,
  );

  // ── Minimap 显示条件：只要内容可滚动即显示（含"一条长消息"场景）──
  let showMinimap = $derived.by(() => {
    const hasNonEmpty = messageStore.messages.some(
      (m) => (m.content ?? "").trim().length > 0,
    );
    if (!hasNonEmpty) return false;
    if (viewportHeight <= 0 || totalHeight <= 0) return false;
    return totalHeight > viewportHeight * 1.05;
  });

  function scrollToMessage(id: string) {
    chat?.scrollToMessage(id, { smooth: true });
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
      estimatedMessageHeight={120}
      followBottomThresholdPx={24}
      containerClass="h-full"
      viewportClass="h-full chat-scroll"
      onFollowBottomChange={(v) => (following = v)}
      onDebugInfo={(info) => {
        // 精细滚动路径：数值相同则 $state 自动去重，不引发重渲染。
        scrollTop = info.scrollTop;
        viewportHeight = info.viewportHeight;
        totalHeight = info.totalHeight;
        measureActiveId();
      }}
    >
      {#snippet renderMessage(message, _index)}
        <div class="px-4 py-3 sm:px-6 lg:px-8" data-message-id={message.id}>
          <!--
            单条消息级渲染兜底：
            即便某条消息内容/traces 结构异常，也只损坏这一条，其它消息与
            输入框、header 全都保持可用。reset 后仅该条消息重新挂载。
          -->
          <svelte:boundary>
            {#if message.role === "user"}
              <!-- 用户：右对齐 + 宽度交给 w-fit max-w-2xl 控制（恢复原始行为） -->
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

  <!-- 消息导航 Minimap（右侧垂直居中 · 面板自管展开） -->
  <MessageMinimap visible={showMinimap} {activeId} onSelect={scrollToMessage} />

  <!-- 回到底部按钮 · 底部居中圆形 · z-30 保证在任意面板之上 -->
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
