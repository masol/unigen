<!-- $lib/components/markdown/ext/CodeBlock.svelte -->
<!--
  功能概览：
  1. 流式输出期间（未拿到完整代码）禁用复制按钮；
  2. 当 code block 的 header 滚出视口顶部、而 code block 仍有部分可见时，
     在锚定到当前 code block 可见区域内的右侧浮动工具栏（含复制 / 滚动到头 / 滚动到尾）；
     一旦 code block 完全离开视口，浮动工具栏一并消失，绝不会悬停在其它元素之上；
  3. 内容长度超过视口时（"一屏装不下"），出现"滚动到代码开头 / 结尾"按钮，
     与复制按钮放在一起（header 内 + 浮动工具栏内）；
     内容够短时不出现。
  注意事项：
  - 外层容器含 `contain:[layout_style]`，会为 `position: fixed` 后代创建新的包含块。
    因此浮动工具栏必须渲染在容器外（同级 siblings），否则会固化为容器坐标而非视口坐标。
  - 滚动监听使用 capture 阶段以捕获任意滚动容器的滚动（包括父级 overflow: auto 的场景），
    不依赖 chat / 任何具体上下游，任何可滚动上下文都能工作。
-->
<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags */
  import {
    MARKDOWN_STREAMING_KEY,
    type MarkdownStreamingState,
  } from "$lib/components/markdown/type";
  import { BorderBeam } from "$lib/components/ui/border-beam";
  import { configStore } from "$lib/store/config.svelte";
  import { getCodeHighlighter } from "@humanspeak/svelte-markdown/extensions/highlight";
  import {
    IconArrowDown,
    IconArrowUp,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCopy,
  } from "@tabler/icons-svelte";
  import { getContext } from "svelte";

  let {
    code = "",
    text = "",
    value = "",
    lang = "",
    language = "",
    /**
     * 流式状态。优先从 Svelte Context 读取（Message.svelte 注入，最可靠）；
     * 若上溯环境没有 Context，则回退到 props（兼容挑岫使用或未来库透传 streaming）。
     */
    streaming: streamingProp = undefined,
    ..._rest
  }: {
    code?: string;
    text?: string;
    value?: string;
    lang?: string;
    language?: string;
    streaming?: boolean;
    [key: string]: unknown;
  } = $props();

  // ── 流式状态：Context 优先，prop 兜底 ────────────────────
  const streamingCtx = getContext<MarkdownStreamingState | undefined>(
    MARKDOWN_STREAMING_KEY,
  );
  let streaming = $derived(streamingCtx?.streaming ?? streamingProp ?? false);

  let source = $derived(code || text || value || "");
  let langName = $derived(lang || language || "");

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  // ── 折叠状态 ─────────────────────────────────────────────
  // userCollapsed: 用户显式操作后的状态，undefined 表示尚未操作
  // autoCollapsed : 由设置的 markdownAutoCollapseCode 阈值决定
  let userCollapsed = $state<boolean | undefined>(undefined);
  let lineCount = $derived(source ? source.split("\n").length : 0);
  let autoCollapsed = $derived(
    configStore.markdownAutoCollapseCode > 0 &&
      lineCount > configStore.markdownAutoCollapseCode,
  );
  let isCollapsed = $derived(userCollapsed ?? autoCollapsed);

  const fallbackPreClass =
    "m-0 overflow-x-auto bg-muted p-4 font-mono text-sm text-foreground";

  let htmlMarkup = $derived.by(() => {
    if (!source) return "";
    const fallback = `<pre class="${fallbackPreClass}"><code>${escapeHtml(source)}</code></pre>`;
    const highlighter = getCodeHighlighter();
    if (!highlighter) return fallback;
    try {
      return highlighter.highlight(source, langName);
    } catch {
      return fallback;
    }
  });

  let copyText = $derived(source.trimEnd());

  // ── 复制能力判定 ────────────────────────────────────────
  // 流式未完成 / 内容为空 → 禁用复制。
  let copyDisabled = $derived(streaming || !source);

  let copyTooltip = $derived(
    copyDisabled
      ? streaming
        ? "流式输出中，尚不可复制"
        : "无代码可复制"
      : copied
        ? "已复制"
        : "复制代码",
  );

  async function handleCopy() {
    if (copyDisabled) return;
    try {
      await navigator.clipboard.writeText(copyText);
      copied = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        copied = false;
        timer = null;
      }, 2000);
    } catch {
      // 剪贴板不可用时静默失败
    }
  }

  function toggleCollapse() {
    userCollapsed = !isCollapsed;
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── DOM 引用 ────────────────────────────────────────────
  let container = $state<HTMLDivElement>();
  let headerEl = $state<HTMLDivElement>();

  // ── 长内容 / 方向性滚动可用性 / 浮动工具栏状态 ────────
  // isLong           : 代码块总高度 > 视口高度（内容"一屏装不下"）
  // showScrollTop    : isLong 且代码块向视口上方溢出 → 需"滚动到开头"
  // showScrollBottom : isLong 且代码块向视口下方溢出 → 需"滚动到结尾"
  // floatingVisible  : header 已滚出视口顶部、而代码块仍任意可见
  // floatingTop/Right: 浮动工具栏在视口坐标系下的位置（夹取到代码块可视区域内）
  let isLong = $state(false);
  let showScrollTop = $state(false);
  let showScrollBottom = $state(false);
  let floatingVisible = $state(false);
  let floatingTop = $state(0);
  let floatingRight = $state(0);

  // 浮动工具栏的几何参数：边距 / 估算高度 / 最小可见高度阈值
  const FLOATING_MARGIN = 12;
  const FLOATING_BUTTON_HEIGHT = 40;
  const MIN_VISIBLE_FOR_FLOAT = 60;
  // 方向性按钮的容差：代码块边缘与视口边缘重叠 > 此值时认为有"溢出"
  const SCROLL_EDGE_TOLERANCE = 8;

  // rAF 节流：避免多个 code block 各自高频锤 getBoundingClientRect
  let rafId: number | undefined;
  function scheduleUpdate() {
    if (typeof window === "undefined") return;
    if (rafId !== undefined) return;
    rafId = requestAnimationFrame(() => {
      rafId = undefined;
      updatePosition();
    });
  }

  function updatePosition() {
    if (typeof window === "undefined") return;
    const el = container;
    if (!el) {
      isLong = false;
      showScrollTop = false;
      showScrollBottom = false;
      floatingVisible = false;
      return;
    }

    const rect = el.getBoundingClientRect();
    const vpTop = 0;
    const vpBottom = window.innerHeight;
    const vpRight = window.innerWidth;

    // 长内容：仅当代码块总高度超过视口时启用滚动辅助按钮
    isLong = rect.height > vpBottom;

    // 方向性按钮：仅在内容向对应方向溢出视口时挂载（短内容不会出现）
    showScrollTop = isLong && rect.top < vpTop - SCROLL_EDGE_TOLERANCE;
    showScrollBottom = isLong && rect.bottom > vpBottom + SCROLL_EDGE_TOLERANCE;

    // 浮动工具栏：header 滚出视口顶部、且代码块仍有可见部分
    const headerHeight = headerEl?.getBoundingClientRect().height ?? 0;
    const headerBottom = rect.top + headerHeight;
    const headerHidden = headerBottom <= vpTop;
    const anyVisible = rect.bottom > vpTop && rect.top < vpBottom;

    if (!headerHidden || !anyVisible) {
      floatingVisible = false;
      return;
    }

    const codeVisibleTop = Math.max(rect.top, vpTop);
    const codeVisibleBottom = Math.min(rect.bottom, vpBottom);

    // 可视区域过小 → 不显示（防止按钮溢出到代码块之外）
    if (codeVisibleBottom - codeVisibleTop < MIN_VISIBLE_FOR_FLOAT) {
      floatingVisible = false;
      return;
    }

    // 垂直方向：默认靠视口顶部，但被夹取在代码块可视区域内
    const desiredTop = vpTop + FLOATING_MARGIN;
    const minTop = codeVisibleTop + FLOATING_MARGIN;
    const maxTop = codeVisibleBottom - FLOATING_MARGIN - FLOATING_BUTTON_HEIGHT;
    floatingTop = Math.max(minTop, Math.min(desiredTop, maxTop));

    // 水平方向：以代码块右边缘为基准，内缩一个 margin；
    // 若代码块右侧超出视口，则贴视口右沿。
    const distFromRight = vpRight - rect.right;
    floatingRight = Math.max(
      FLOATING_MARGIN,
      Math.max(0, distFromRight) + FLOATING_MARGIN,
    );

    floatingVisible = true;
  }

  // ── 滚动到代码块开头 / 结尾 ─────────────────────────────
  // scrollIntoView 会向上找最近的滚动祖先；不依赖 chat 容器，任意可滚动环境都可用。
  function scrollToTop() {
    container?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToBottom() {
    container?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  // ── 监听 + 观测 ─────────────────────────────────────────
  $effect(() => {
    if (typeof window === "undefined") return;

    // 依赖追踪：container / headerEl 变了（挂载完成）后重装监听
    const el = container;
    void headerEl;
    void isCollapsed; // 折叠/展开后高度会变，重新触发也许可更早响应

    const onScroll = () => scheduleUpdate();
    const onResize = () => scheduleUpdate();

    // capture: true —— 捕获任意滚动容器（含父级 overflow: auto）
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", onResize, { passive: true });

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined" && el) {
      // 代码块自身高度变化（折叠 / 流式增长 / 语言切换）→ 更新 isLong
      ro = new ResizeObserver(() => scheduleUpdate());
      ro.observe(el);
    }

    // 初次宨迟一帧，等布局稳定
    scheduleUpdate();

    return () => {
      window.removeEventListener("scroll", onScroll, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
        rafId = undefined;
      }
    };
  });

  // ── 复制计时器清理（卸载时）───────────────────────────
  $effect(() => {
    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  });
</script>

<!--
  外层容器：
  - `contain:[layout_style]` 是现有项目意的设计（为减少重排影响范围）；
  - 因此浮动工具栏必须渲染在 **此容器之外**，否则 `position: fixed` 会被
    约束到此容器的盒模型（而不是视口），锚定算法完全失效。
-->
<div
  bind:this={container}
  class="group relative w-full overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm contain-[layout_style]"
>
  <!--
    仅以 BorderBeam 指示 hover / focus 范围：
    - 静态 shadow-sm，无 hover 位移、无 hover 阴影切换 → 卡片几何完全静止
    - size={1} 为 hairline 环，duration={10} 为慢节奏 ambient 扫光
    - opacity 由 group-hover / group-focus-within 控制，仅悬停或键盘聚焦时显现
  -->
  <BorderBeam
    size={1}
    duration={10}
    color="var(--primary)"
    class="z-20 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
  />

  <div
    bind:this={headerEl}
    class="flex items-center justify-between gap-2 border-b border-border/50 bg-card/95 px-3 py-2"
  >
    <span class="font-mono text-xs lowercase text-muted-foreground">
      {langName || ""}
    </span>

    <div class="flex items-center gap-0.5">
      <!--
        滚动到开头 / 结尾：
        - 只在 isLong + 内容向对应方向溢出视口时出现
        - 完整保留在 header 内（与复制同区，方便发现）
        - 用户已在某一端时对应按钮自然隐藏，避免无效点击
      -->
      {#if isLong && showScrollTop}
        <button
          type="button"
          onclick={scrollToTop}
          aria-label="滚动至代码块开头"
          title="滚动至代码块开头"
          class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <IconArrowUp size={14} stroke={1.5} />
        </button>
      {/if}
      {#if isLong && showScrollBottom}
        <button
          type="button"
          onclick={scrollToBottom}
          aria-label="滚动至代码块结尾"
          title="滚动至代码块结尾"
          class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <IconArrowDown size={14} stroke={1.5} />
        </button>
      {/if}

      <!-- 折叠 / 展开（仅在未流式时主动提示；流式时因按钮禁用也无妨） -->
      <button
        type="button"
        onclick={toggleCollapse}
        aria-label={isCollapsed ? "展开代码" : "收起代码"}
        title={isCollapsed ? "展开代码" : "收起代码"}
        class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {#if isCollapsed}
          <IconChevronDown size={14} stroke={1.5} />
        {:else}
          <IconChevronUp size={14} stroke={1.5} />
        {/if}
      </button>

      <!--
        复制：流式输出中（未拿到完整代码）时禁用。
        disabled 状态与浮动工具栏中的复制按钮同源（copyDisabled），保持一致。
      -->
      <button
        type="button"
        onclick={handleCopy}
        // disabled={copyDisabled}
        aria-label={copyTooltip}
        title={copyTooltip}
        class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        {#if copied}
          <IconCheck size={14} stroke={1.5} />
        {:else}
          <IconCopy size={14} stroke={1.5} />
        {/if}
      </button>
    </div>
  </div>

  {#if !isCollapsed}
    <!-- 代码主体：高度自适应，无垂直滚动 -->
    <div class="[&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:p-4">
      {#if htmlMarkup}
        {@html htmlMarkup}
      {:else}
        <pre class={fallbackPreClass}><code>{source}</code></pre>
      {/if}
    </div>
  {/if}
</div>

<!--
  浮动工具栏：渲染在 container 同级（不在 contain: layout 的子树内），
  保证 `position: fixed` 以视口为坐标系；
  通过 updatePosition 将 top/right 夹取到代码块当前可视矩形内：
    - 代码块任意部分离开视口 → floatingVisible = false，工具栏整体卸载
    - 代码块仍在视口中 → top/right 被夹取，按钮永远坐落在本 code block 之上
  绝不跨到其它消息或页面元素之上。
-->
{#if floatingVisible}
  <div
    class="pointer-events-none fixed z-30"
    style:top={`${floatingTop}px`}
    style:right={`${floatingRight}px`}
  >
    <div
      class="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border/50 bg-popover/95 p-1 shadow-lg backdrop-blur-sm"
    >
      {#if isLong && showScrollTop}
        <button
          type="button"
          onclick={scrollToTop}
          aria-label="滚动至代码块开头"
          title="滚动至代码块开头"
          class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <IconArrowUp size={14} stroke={1.5} />
        </button>
      {/if}
      {#if isLong && showScrollBottom}
        <button
          type="button"
          onclick={scrollToBottom}
          aria-label="滚动至代码块结尾"
          title="滚动至代码块结尾"
          class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <IconArrowDown size={14} stroke={1.5} />
        </button>
      {/if}
      <button
        type="button"
        onclick={handleCopy}
        disabled={copyDisabled}
        aria-label={copyTooltip}
        title={copyTooltip}
        class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
      >
        {#if copied}
          <IconCheck size={14} stroke={1.5} />
        {:else}
          <IconCopy size={14} stroke={1.5} />
        {/if}
      </button>
    </div>
  </div>
{/if}
