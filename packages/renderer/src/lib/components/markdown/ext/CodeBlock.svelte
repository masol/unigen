<!-- $lib/components/markdown/ext/CodeBlock.svelte -->
<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags */
  import { BorderBeam } from "$lib/components/ui/border-beam";
  import { configStore } from "$lib/store/config.svelte";
  import { getCodeHighlighter } from "@humanspeak/svelte-markdown/extensions/highlight";
  import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCopy,
  } from "@tabler/icons-svelte";

  let {
    code = "",
    text = "",
    value = "",
    lang = "",
    language = "",
    ..._rest
  }: {
    code?: string;
    text?: string;
    value?: string;
    lang?: string;
    language?: string;
    [key: string]: unknown;
  } = $props();

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

  async function handleCopy() {
    if (!copyText) return;
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
</script>

<div
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
    class="flex items-center justify-between gap-2 border-b border-border/50 bg-card/95 px-3 py-2"
  >
    <span class="font-mono text-xs lowercase text-muted-foreground">
      {langName || ""}
    </span>

    <div class="flex items-center gap-0.5">
      <!-- 折叠/展开 -->
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

      <!-- 复制 -->
      <button
        type="button"
        onclick={handleCopy}
        disabled={!source}
        aria-label={copied ? "已复制" : "复制代码"}
        title={copied ? "已复制" : "复制代码"}
        class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-30"
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
