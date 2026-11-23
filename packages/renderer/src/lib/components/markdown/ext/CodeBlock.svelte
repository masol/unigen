<!-- $lib/components/markdown/ext/CodeBlock.svelte -->
<!--
  功能概览：
  1. 流式输出期间（本块未拿到完整代码）默认禁用复制按钮；
     "是否完成"以「本代码块围栏是否闭合」为准，而不是整条消息是否结束。
     这样一旦 ``` / ~~~ 闭合，本块可立即复制，即使整条消息仍在输出。
  2. raw 缺失（库未按预期透传 token）→ 无法判断围栏闭合 → 按"已完成"处理，
     即可直接复制。这样不会因为"库没传 raw"这种自身不可控原因导致用户等待
     整条消息才可复制；文档级 streaming 只在"能证明本块未闭合"时才生效。
  3. 兜底：鼠标悬停在代码块（或浮动工具栏）上、且按住 Ctrl / ⌘ 时，无条件
     开放复制（即使能证明本块围栏尚未闭合）。
  4. 当 code block 的 header 滚出视口顶部、而 code block 仍有部分可见时，
     在锚定到当前 code block 可见区域内的右侧浮动工具栏（含复制 / 滚动到头 /
     滚动到尾）；一旦 code block 完全离开视口，浮动工具栏一并消失，
     绝不会悬停在其它元素之上。
  5. 内容长度超过视口时（"一屏装不下"），出现"滚动到代码开头 / 结尾"按钮，
     与复制按钮放在一起（header 内 + 浮动工具栏内）；内容够短时不出现。
  注意事项：
  - 外层容器含 `contain:[layout_style]`，会为 `position: fixed` 后代创建新的
    包含块。因此浮动工具栏必须渲染在容器外（同级 siblings），否则会固化为
    容器坐标而非视口坐标。
  - 滚动监听使用 capture 阶段以捕获任意滚动容器的滚动（包括父级 overflow:
    auto 的场景），不依赖 chat / 任何具体上下游。
  - "本块是否闭合"依赖 code token 的 `raw`（含首尾围栏）。该属性由库的
    `<Parser {...restProps} {...token}>` 展平下发，类型没声明但运行时到得了。
    raw 缺失时，按"未知 → 视为已完成"处理（见 isFenceClosed 返回 null 分支），
    不做"未知即禁用"的保守策略。
  - a11y：带 pointerenter/leave 的静态元素必须携带 role，否则触发
    a11y_no_static_element_interactions；这里用 role="group"（非 landmark，
    不会污染阅读器的 landmark 导航）。
-->

<script module lang="ts">
  /**
   * 判定围栏代码块是否已经闭合。
   *
   * 依据（CommonMark）：
   *   - 起始围栏：可选 ≤3 空格缩进 / 多级 blockquote `>` 前缀，≥3 个 ` 或 ~；
   *   - 闭合围栏：必须独占一行、同一字符、长度 ≥ 起始围栏、且其余只允许空白。
   *
   * 返回值三态，语义在本次改动中明确区分：
   *   true  → 明确已闭合           （本块已完成）
   *   false → 明确未闭合           （跟随文档级 streaming 上界）
   *   null  → 无法判断             （raw 缺失 / 起始围栏无法解析等）
   *
   * 对 null 的处理由调用方决定；本组件选择「未知视为已完成」，
   * 保证"库没按预期透传属性"时不会让用户被迫等整条消息结束才能复制。
   */
  function isFenceClosed(
    raw: string | undefined,
    codeBlockStyle?: string,
  ): boolean | null {
    // raw 缺失 → 无法判断（可能是外部复用 CodeBlock 未传 raw）
    if (!raw) return null;

    // 缩进式代码块（4 空格缩进）在 markdown 中本就无需围栏 → 视为已完成
    if (codeBlockStyle === "indented") return true;

    // 找起始围栏：允许缩进 / 多级 blockquote `> ` 前缀；捕获组 1 是围栏本体
    // 注意：`[^\n]*` 会把 `\r` 一并吃进 info string；这在判断"起点行末位置"时
    // 不影响结果（startLineEnd 只用来切分"起始行 vs 余下内容"）。
    const startMatch =
      /^(?:[ \t]*(?:>[ \t]?)*)?(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(raw);
    if (!startMatch) return null; // 非围栏代码块/畸形输入 → 无法判断

    const fence = startMatch[1]!;
    const fenceChar = fence[0]!;
    const fenceLen = fence.length;
    const startLineEnd = startMatch[0].length;

    // 只剩起始行（无内容、无闭合行）→ 明确未闭合
    if (startLineEnd >= raw.length) return false;

    // 剥掉尾部空白（多余的 \n / \r / 空格），取末行做闭合对照
    const trimmed = raw.trimEnd();
    if (trimmed.length <= startLineEnd) return false;

    const lastNL = trimmed.lastIndexOf("\n");
    if (lastNL < startLineEnd - 1) return false;

    // 末行：幂等剥掉 blockquote 前缀 + 首尾空白（允许多至 3 个前导空格，
    // 即 CommonMark 对闭合围栏缩进的上限；trim 也顺带清掉尾部空白）。
    const lastLine = trimmed
      .slice(lastNL + 1)
      .replace(/^[ \t]*(?:>[ \t]?)*/, "")
      .trim();

    // 长度必须 ≥ 起始围栏长度，且全部由同一围栏字符组成（长度不足是"假闭合"）
    if (lastLine.length < fenceLen) return false;
    for (const ch of lastLine) {
      if (ch !== fenceChar) return false;
    }
    return true;
  }
</script>

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
     * code token 的原始 markdown（含首尾围栏）。
     * 由库 Parser 从 token 展平下发；类型未声明但运行时存在。
     * 用于判定"本块围栏是否已闭合"，从而决定是否真的可以复制。
     */
    raw = "",
    /**
     * marked 对缩进式代码块给出的 "indented"；围栏代码块通常无此字段。
     */
    codeBlockStyle = undefined,
    /**
     * 文档级流式状态。优先从 Svelte Context 读取（Message.svelte 注入，最可靠）；
     * 若上溯环境没有 Context，则回退到 props（兼容直接使用或未来库透传）。
     * 语义为"整条消息是否还在流"的上界，不直接等同于"本块可复制"。
     */
    streaming: streamingProp = undefined,
    ..._rest
  }: {
    code?: string;
    text?: string;
    value?: string;
    lang?: string;
    language?: string;
    raw?: string;
    codeBlockStyle?: string;
    streaming?: boolean;
    [key: string]: unknown;
  } = $props();

  // ── 流式状态：Context 优先，prop 兜底 ────────────────────
  // documentStreaming ：整条消息是否仍在流式（上界）
  // fenceClosedKnown   ：本块围栏是否闭合；true/false 明确，null 表示无法判断
  // fenceClosed        ：未知按"已完成"处理（配合 raw 缺失时"直接可复制"的
  //                      产品选择；详见 module 里 isFenceClosed 的注释）
  // streaming          ：本块自身的"仍在流"判定
  //                      = 文档还在流 && 本块围栏明确未闭合
  const streamingCtx = getContext<MarkdownStreamingState | undefined>(
    MARKDOWN_STREAMING_KEY,
  );
  let documentStreaming = $derived(
    streamingCtx?.documentStreaming ?? streamingProp ?? false,
  );
  let fenceClosedKnown = $derived(isFenceClosed(raw, codeBlockStyle));
  let fenceClosed: boolean = $derived(fenceClosedKnown ?? true);
  let streaming: boolean = $derived(documentStreaming && !fenceClosed);

  let source = $derived(code || text || value || "");
  let langName = $derived(lang || language || "");

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  // ── 折叠状态 ─────────────────────────────────────────────
  // userCollapsed: 用户显式操作后的状态，undefined 表示尚未操作
  // autoCollapsed : 由设置的 markdownAutoCollapseCode 阈值决定
  let userCollapsed = $state<boolean | undefined>(undefined);
  let lineCount = $derived(source ? source.split("\n").length : 0);
  let autoCollapsed: boolean = $derived(
    configStore.markdownAutoCollapseCode > 0 &&
      lineCount > configStore.markdownAutoCollapseCode,
  );
  let isCollapsed: boolean = $derived(userCollapsed ?? autoCollapsed);

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

  // ── 鼠标悬停 / 修饰键交叉状态 ────────────────────────────
  // hoveringCode  : 鼠标悬停在代码块容器上
  // hoveringFloat : 鼠标悬停在（容器外的）浮动工具栏上
  // focusWithin   : 焦点在容器内部（键盘可达）
  // modifierHeld  : 全局按着 Ctrl / ⌘（切窗时会由 blur 兜底重置）
  let hoveringCode = $state(false);
  let hoveringFloat = $state(false);
  let focusWithin = $state(false);
  let modifierHeld = $state(false);

  let hovering = $derived(hoveringCode || hoveringFloat);
  // 强制复制条件：同时满足"人在本块附近"+"按住修饰键"
  let forceAvailable = $derived(modifierHeld && (hovering || focusWithin));

  // ── 复制能力判定 ────────────────────────────────────────
  // baseDisabled ：内容为空 / 本块仍在流式；forceAvailable 可绕过
  //                空内容属于"确实无内容"，不绕过。
  let baseDisabled = $derived(!source || streaming);
  let copyDisabled = $derived(baseDisabled && !forceAvailable);

  let copyTooltip = $derived.by(() => {
    if (!source) return "无代码可复制";
    if (copied) return "已复制";
    if (streaming) {
      if (forceAvailable) return "复制代码（强制，本块仍在流式）";
      return "流式输出中，按住 Ctrl / ⌘ 可强制复制";
    }
    // 微调：本块已可用但整条消息仍在流式时，让用户知道"本块已可用"
    if (documentStreaming) return "复制代码（本块已可用）";
    return "复制代码";
  });

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

  // ── 全局修饰键监听（Ctrl / ⌘）─────────────────────────
  // 说明：
  //   - 使用全局 keydown/keyup，而非绑到容器上：用户常见动作是"鼠标悬停在
  //     代码块上、然后空出一只手按下 Ctrl"，容器本身通常不可聚焦；
  //   - keyup 用 `e.ctrlKey || e.metaKey` 同步：能兜住"用户在按住 Ctrl 时
  //     又按了别的字母键"这类"按键序列"状态；
  //   - blur 兜底：切窗/切标签/IME 弹出时按住键的 keyup 会丢，必须重置，
  //     否则状态会卡在 true；
  //   - Meta 覆盖 Mac：macOS 上 Ctrl+Click 是右键，Cmd 才是惯用复制修饰键，
  //     一并放开兼容两边习惯（tooltip 里也写明）。
  $effect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) modifierHeld = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      modifierHeld = e.ctrlKey || e.metaKey;
    };
    const onBlur = () => {
      modifierHeld = false;
    };
    window.addEventListener("keydown", onKeyDown, { passive: true });
    window.addEventListener("keyup", onKeyUp, { passive: true });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
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
  - pointerenter / pointerleave 用于 hover 判断（配合 Ctrl 强制复制）。
  - focusin / focusout 用冒泡版本，让"键盘 Tab 进到本块内按钮时"也触发强制判定，
    照顾无鼠标场景。
  - a11y：带 pointerenter/leave 的静态元素必须携带 role，否则触发
    a11y_no_static_element_interactions；这里选 role="group"（非 landmark，
    不会污染阅读器的 landmark 导航），并用 aria-label 给出可访问名。
-->
<div
  bind:this={container}
  onpointerenter={() => (hoveringCode = true)}
  onpointerleave={() => (hoveringCode = false)}
  onfocusin={() => (focusWithin = true)}
  onfocusout={() => (focusWithin = false)}
  role="group"
  aria-label={langName ? `${langName} 代码块` : "代码块"}
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
        复制：
        - 默认在本块流式未完成时禁用；
        - 鼠标悬停 + Ctrl/⌘ 按住 → copyDisabled 变 false，强制可复制；
        - disabled 与浮动工具栏内按钮共享 copyDisabled，保持一致。
      -->
      <button
        type="button"
        onclick={handleCopy}
        disabled={copyDisabled}
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
    <!--
      a11y：内层带 pointerenter/leave，必须携带 role 消除
      a11y_no_static_element_interactions。这里用 role="group"（工具栏组），
      比 role="toolbar" 少一层"应实现 roving tabindex + 方向键导航"的 APG 期待。
    -->
    <div
      class="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border/50 bg-popover/95 p-1 shadow-lg backdrop-blur-sm"
      onpointerenter={() => (hoveringFloat = true)}
      onpointerleave={() => (hoveringFloat = false)}
      role="group"
      aria-label="代码块操作"
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
