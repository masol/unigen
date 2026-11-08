<!-- 通用 markdown 渲染组件 -->
<script module lang="ts">
  // ── prose 配色（模块级常量，避免每次实例化重算） ──────────
  // 结构性规则：normal/error 共用
  const baseProse = [
    // 文本颜色：只指定实际的"文本载体"元素，避免整体 **:text-* 碾压代码高亮
    "[&_p]:text-foreground [&_li]:text-foreground",
    "[&_strong]:text-foreground [&_em]:text-foreground",
    "[&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground",
    "[&_h4]:text-foreground [&_h5]:text-foreground [&_h6]:text-foreground",
    "[&_th]:text-foreground [&_td]:text-foreground",
    // 结构
    "[&_code]:break-words",
    "[&_pre]:w-full [&_pre]:min-w-0 [&_pre]:overflow-x-auto",
    "[&_pre_code]:whitespace-pre",
    // 链接下划线统一到 prose 层(宿主可覆盖)
    "[&_a]:underline [&_a]:underline-offset-2",
    "[&_hr]:border-border/60",
    "[&_th]:border-border/60 [&_td]:border-border/40",
  ].join(" ");

  const normalProse = [
    baseProse,
    "text-foreground",
    "[&_a]:text-primary",
    "[&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:text-foreground [&_:not(pre)>code]:font-medium",
    "[&_pre]:bg-muted [&_pre]:text-foreground",
    "[&_blockquote]:border-border [&_blockquote]:text-muted-foreground",
  ].join(" ");

  const errorProse = [
    baseProse,
    "text-destructive",
    // 覆盖 baseProse 中已有的 text-foreground 规则
    "[&_p]:text-destructive [&_li]:text-destructive",
    "[&_strong]:text-destructive [&_em]:text-destructive",
    "[&_h1]:text-destructive [&_h2]:text-destructive [&_h3]:text-destructive",
    "[&_h4]:text-destructive [&_h5]:text-destructive [&_h6]:text-destructive",
    "[&_th]:text-destructive [&_td]:text-destructive",
    "[&_a]:text-destructive",
    "[&_:not(pre)>code]:bg-destructive/10 [&_:not(pre)>code]:text-destructive",
    "[&_pre]:bg-destructive/10 [&_pre]:text-destructive",
    "[&_blockquote]:border-destructive/40 [&_blockquote]:text-destructive/90",
  ].join(" ");
</script>

<script lang="ts">
  import type {
    MarkdownMessage,
    MarkdownRenderers,
  } from "$lib/components/markdown/type";
  import SvelteMarkdown, {
    Html,
    type HtmlRenderers,
  } from "@humanspeak/svelte-markdown";
  import Link from "./ext/Link.svelte";
  import Media from "./ext/Media.svelte";
  import Thinking from "./ext/Thinking.svelte";

  let {
    message,
    isError,
    streaming = false,
    renderers: renderersProp = {},
  }: {
    message: MarkdownMessage;
    isError?: boolean;
    streaming?: boolean;
    renderers?: MarkdownRenderers;
  } = $props();

  // isError 真源：props > message.isError
  // 错误态仅调整文字配色，错误图标由宿主(AssistantMessage 外层边框)负责
  let error = $derived(isError ?? message.isError ?? false);
  let proseClass = $derived(error ? errorProse : normalProse);

  // renderers：预置链接、图片媒体 & <thinking>，外部可覆盖
  let renderers = $derived<MarkdownRenderers>({
    link: Link,
    image: Media,
    ...renderersProp,
    html: {
      ...Html,
      thinking: Thinking,
      ...(renderersProp.html ?? {}),
    } satisfies HtmlRenderers,
  });
</script>

<div
  class={[
    "prose prose-sm w-full min-w-0 max-w-none wrap-break-word select-text",
    proseClass,
  ]}
  style="font-family: system-ui, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;"
>
  <SvelteMarkdown source={message.content} {renderers} {streaming} />
  {#if streaming && !error}
    <!-- 流式 caret：末尾闪烁，提示"正在写入" -->
    <span
      class="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-primary align-middle"
      aria-hidden="true"
    ></span>
  {/if}
</div>
