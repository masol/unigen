<!-- 消息列表：虚拟滚动 + 自动跟随底部 + DOM 测量式 scrollspy + 比例兜底 + 底部居中"回到底部"按钮 -->
<!-- 长消息快速导航：以"视口垂直中心（按钮所在位置）下方的消息"为锚点；边界可见时按钮自动渐隐 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import SvelteVirtualChat from "@humanspeak/svelte-virtual-chat";
  import { IconArrowDown, IconArrowUp } from "@tabler/icons-svelte";
  import { tick } from "svelte";
  import { fade } from "svelte/transition";
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

  /**
   * 中心锚点消息 id。
   *
   * 语义：**"视口垂直中心（浮动按钮所在位置）下方的那条消息"**。
   * 只有它是长消息（DOM 高度 > 一屏）时，才展示"跳顶部/跳底部"浮动按钮；
   * 保证"按下的按钮一定作用于它下方的那条消息"，不存在视觉和行为的错位。
   *
   * 相比"视口内占用高度最大的消息"：中心锚点是离散切换（只有中心点越过
   * 某条消息边界才改变），两条高度接近的长消息之间夹一条短消息时
   * 不会出现"来回抢占锚点"导致的按钮组闪烁。
   */
  let longMessageId = $state<string | undefined>(undefined);

  /**
   * 头/尾按钮可见性：true 表示"对应边界尚未进入视口"，需要展示按钮。
   * 与 longMessageId 基于同一份 DOMRect 计算，保证整体语义一致。
   */
  let edgeTopVisible = $state(false);
  let edgeBottomVisible = $state(false);

  /**
   * 边缘容差：消息头/尾部需要"明确"出画/入画才切换按钮可见性，
   * 吸收 ±1px 临界滚动抖动。16px 是经过取舍的值（更小则易抖，更大则按钮
   * 在"刚出画一点点"时过早出现，操作收益低）。
   */
  const EDGE_EPSILON = 16;

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

  /**
   * 一次 DOM 扫描内计算三件事：
   * 1) measuredActiveId：scrollspy（沿用原逻辑，不改变 minimap 现有高亮行为）
   * 2) longMessageId：中心锚点 = 视口垂直中心下方的消息
   * 3) edgeTopVisible / edgeBottomVisible：该锚点消息的头/尾是否已入视口
   *
   * 关于"距离相等时优先下方那条"：
   * - 遍历顺序是文档从上到下，`dist <= anchorDist` 让"后遇到的"覆盖
   *   "先遇到的"。两条邻居消息夹在中心点两侧的对称间隙里时，
   *   会选中下方那条——与"按钮下方即目标"的直觉一致。
   */
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

    // scrollspy（保持原语义：视口内可见且 top 最大的节点）
    let bestId: string | undefined;
    let bestTop = -Infinity;

    // 中心锚点：距离视口垂直中心最近（含 0 距离 = 严格包含）的消息
    const centerY = viewRect.top + viewRect.height / 2;
    let anchorId: string | undefined;
    let anchorRect: DOMRect | null = null;
    let anchorDist = Infinity;

    for (const node of nodes) {
      const r = node.getBoundingClientRect();

      if (r.bottom > viewRect.top && r.top < viewRect.bottom) {
        if (r.top > bestTop) {
          bestTop = r.top;
          bestId = node.dataset.messageId;
        }
      }

      // 中心点到本条消息矩形的最短垂直距离
      //   中心在消息上方  → dist = r.top - centerY
      //   中心在消息下方  → dist = centerY - r.bottom
      //   中心在消息内    → dist = 0
      const dist =
        centerY < r.top
          ? r.top - centerY
          : centerY > r.bottom
            ? centerY - r.bottom
            : 0;

      // <=：距离相同时让"后遍历到的（下方那条）"胜出
      if (dist <= anchorDist) {
        anchorDist = dist;
        anchorId = node.dataset.messageId;
        anchorRect = r;
      }
    }

    if (bestId) measuredActiveId = bestId;

    if (viewRect.height > 0) {
      // 只有"超过一屏"的消息才提供快速导航：短消息（含一行用户消息）
      // 不会出现按钮，杜绝临界抖动下的按钮闪现。
      if (
        anchorId &&
        anchorRect &&
        anchorRect.height > viewRect.height * 1.02
      ) {
        longMessageId = anchorId;
        // 消息头已滑出视口顶部 >= EPSILON → 需要"跳顶部"
        edgeTopVisible = anchorRect.top < viewRect.top - EDGE_EPSILON;
        // 消息尾已滑出视口底部 >= EPSILON → 需要"跳底部"
        edgeBottomVisible = anchorRect.bottom > viewRect.bottom + EDGE_EPSILON;
      } else {
        longMessageId = undefined;
        edgeTopVisible = false;
        edgeBottomVisible = false;
      }
    }
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
   * 从 minimap 跳转到指定消息。
   *
   * 运行期间用 `smooth: false` instant 定位，避免流式重排打断动画；
   * 非运行状态用 `smooth: true` 更顺滑。同时主动脱离 follow-bottom，
   * 避免落点距底 <= 48px 时被后续更新拉回。
   */
  function scrollToMessage(id: string) {
    if (!chat) return;
    following = false;
    const smooth = !messageStore.isLoading;
    chat.scrollToMessage(id, { smooth });
  }

  function jumpToBottom() {
    following = true;
    chat?.scrollToBottom({ smooth: true });
  }

  /**
   * 跳转到当前锚点消息（按钮下方那条）的顶部 / 底部。
   *
   * 为什么直接操作 viewport.scrollTo：
   * - 库的 `scrollToMessage` 只支持"对齐 item 顶部"，无法对齐 item 底部；
   * - 一次性原生滚动不持续驱动，不会破坏虚拟库内部状态；
   * - 终点通过 `scrollHeight - clientHeight` clamp，原生滚动天然防越界。
   *
   * 运行期间 `behavior: 'auto'`（instant），避免被 follow-bottom / 重排吞掉；
   * 非运行期间 `'smooth'`。
   *
   * 点击即主动导航 → 显式 `following = false`，保持与 scrollToMessage 一致语义。
   */
  function scrollToMessageEdge(id: string, edge: "top" | "bottom") {
    const wrapper = wrapperEl;
    if (!wrapper) return;
    const viewport = wrapper.querySelector(
      ".chat-scroll",
    ) as HTMLElement | null;
    if (!viewport) return;
    const safeId =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
    const node = viewport.querySelector(
      `[data-message-id="${safeId}"]`,
    ) as HTMLElement | null;
    if (!node) return;

    following = false;

    const nodeRect = node.getBoundingClientRect();
    const viewRect = viewport.getBoundingClientRect();
    const currentTop = viewport.scrollTop;

    const delta =
      edge === "top"
        ? nodeRect.top - viewRect.top
        : nodeRect.bottom - viewRect.bottom;
    const target = currentTop + delta;
    const maxTop = viewport.scrollHeight - viewport.clientHeight;

    viewport.scrollTo({
      top: Math.max(0, Math.min(target, maxTop)),
      behavior: messageStore.isLoading ? "auto" : "smooth",
    });
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

  <!--
    长消息快速导航：
    - 仅当"中心锚点消息高度超过一屏"时出现（短消息绝不出现）；
    - 位置固定在视口左侧中部，与锚点消息的滚动位置无关 → 永不错位；
    - 每个按钮包一层透明 div 以承载 fade 过渡（Svelte 5 推荐原生元素承担 transition）；
    - 容器 use:autoAnimate：一个按钮淡出后，剩余按钮自动平滑补位。
  -->
  {#if longMessageId}
    {@const scrollId = longMessageId}
    <div
      class="pointer-events-none absolute left-2 top-1/2 z-30 flex -translate-x-1/4 -translate-y-1/2 flex-col gap-1.5"
      role="toolbar"
      aria-label="当前消息快速导航"
      use:autoAnimate
    >
      {#if edgeTopVisible}
        <div transition:fade={{ duration: 180 }}>
          <Button
            variant="secondary"
            size="icon"
            onclick={() => scrollToMessageEdge(scrollId, "top")}
            class="pointer-events-auto size-8 rounded-full border border-border/50 opacity-10 shadow-lg backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:opacity-100 hover:shadow-xl focus-visible:opacity-100 active:translate-y-0 active:scale-95 dark:opacity-30 dark:hover:opacity-100 dark:focus-visible:opacity-100"
            aria-label="跳到本消息顶部"
            title="跳到本消息顶部"
          >
            <IconArrowUp size={16} stroke={1.5} />
          </Button>
        </div>
      {/if}

      {#if edgeBottomVisible}
        <div transition:fade={{ duration: 180 }}>
          <Button
            variant="secondary"
            size="icon"
            onclick={() => scrollToMessageEdge(scrollId, "bottom")}
            class="pointer-events-auto size-8 rounded-full border border-border/50 opacity-10 shadow-lg backdrop-blur-sm transition-all duration-200 hover:translate-y-0.5 hover:opacity-100 hover:shadow-xl focus-visible:opacity-100 active:translate-y-0 active:scale-95 dark:opacity-30 dark:hover:opacity-100 dark:focus-visible:opacity-100"
            aria-label="跳到本消息底部"
            title="跳到本消息底部"
          >
            <IconArrowDown size={16} stroke={1.5} />
          </Button>
        </div>
      {/if}
    </div>
  {/if}

  {#if showJumpButton}
    <div
      class="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 animate-slide-up"
    >
      <Button
        variant="secondary"
        size="icon"
        onclick={jumpToBottom}
        class="pointer-events-auto size-10 rounded-full border border-border/50 opacity-10 shadow-lg backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:opacity-100 hover:shadow-xl focus-visible:opacity-100 active:scale-95 dark:opacity-30 dark:hover:opacity-100 dark:focus-visible:opacity-100"
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
