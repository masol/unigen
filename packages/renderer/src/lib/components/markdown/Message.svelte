<!-- Message.svelte（全文） -->
<script module lang="ts">
  import { setCodeHighlighter } from "@humanspeak/svelte-markdown/extensions/highlight";
  import { createTanstackHighlighter } from "@humanspeak/svelte-markdown/extensions/tanstack-highlight";
  import CodeBlock from "./ext/CodeBlock.svelte";

  // 从 TanStack 官方子路径导入语言定义对象（LanguageDefinition）
  import { c } from "@tanstack/highlight/languages/c";
  import { cpp } from "@tanstack/highlight/languages/cpp";
  import { csharp } from "@tanstack/highlight/languages/csharp";
  import { css } from "@tanstack/highlight/languages/css";
  import { diff } from "@tanstack/highlight/languages/diff";
  import { dockerfile } from "@tanstack/highlight/languages/dockerfile";
  import { go } from "@tanstack/highlight/languages/go";
  import { graphql } from "@tanstack/highlight/languages/graphql";
  import { html } from "@tanstack/highlight/languages/html";
  import { http } from "@tanstack/highlight/languages/http";
  import { ini } from "@tanstack/highlight/languages/ini";
  import { java } from "@tanstack/highlight/languages/java";
  import { js } from "@tanstack/highlight/languages/js";
  import { json } from "@tanstack/highlight/languages/json";
  import { jsx } from "@tanstack/highlight/languages/jsx";
  import { markdown } from "@tanstack/highlight/languages/markdown";
  import { php } from "@tanstack/highlight/languages/php";
  import { plaintext } from "@tanstack/highlight/languages/plaintext";
  import { python } from "@tanstack/highlight/languages/python";
  import { shell } from "@tanstack/highlight/languages/shell"; // bash 的替代
  import { sql } from "@tanstack/highlight/languages/sql";
  import { svelte } from "@tanstack/highlight/languages/svelte";
  import { toml } from "@tanstack/highlight/languages/toml";
  import { ts } from "@tanstack/highlight/languages/ts";
  import { tsx } from "@tanstack/highlight/languages/tsx";
  import { vue } from "@tanstack/highlight/languages/vue";
  import { yaml } from "@tanstack/highlight/languages/yaml";

  // TanStack 高亮引擎是同步的，SSR 安全，无需 window 守卫。
  setCodeHighlighter(
    createTanstackHighlighter({
      languages: [
        c,
        cpp,
        csharp,
        css,
        diff,
        dockerfile,
        go,
        graphql,
        html,
        http,
        ini,
        java,
        js,
        json,
        jsx,
        markdown,
        php,
        plaintext,
        python,
        shell,
        sql,
        svelte,
        toml,
        ts,
        tsx,
        vue,
        yaml,
      ],
    }),
  );

  const baseProse = [
    "[&_code]:break-words",
    "[&_pre]:w-full [&_pre]:min-w-0 [&_pre]:overflow-x-auto",
    "[&_pre]:text-[length:var(--md-code-size,13px)]",
    "[&_pre_code]:whitespace-pre",
    "[&_a]:underline [&_a]:underline-offset-2",
    "[&_hr]:border-border/60",
    "[&_th]:border-border/60 [&_td]:border-border/40",
  ].join(" ");

  const normalProse = [
    baseProse,
    "text-foreground",
    "[&_p]:text-foreground [&_li]:text-foreground",
    "[&_strong]:text-foreground [&_em]:text-foreground",
    "[&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground",
    "[&_h4]:text-foreground [&_h5]:text-foreground [&_h6]:text-foreground",
    "[&_th]:text-foreground [&_td]:text-foreground",
    "[&_a]:text-primary",
    "[&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:text-foreground [&_:not(pre)>code]:font-medium",
    "[&_pre]:bg-muted [&_pre]:text-foreground",
    "[&_blockquote]:border-border [&_blockquote]:text-muted-foreground",
  ].join(" ");

  const errorProse = [
    baseProse,
    "text-destructive",
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
    MarkdownStreamingState,
  } from "$lib/components/markdown/type";
  import { MARKDOWN_STREAMING_KEY } from "$lib/components/markdown/type";
  import { configStore } from "$lib/store/config.svelte";
  import type { MarkdownFontFamily } from "@app/main/types";
  import SvelteMarkdown, {
    Html,
    type HtmlRenderers,
  } from "@humanspeak/svelte-markdown";
  import {
    KatexRenderer,
    markedKatex,
  } from "@humanspeak/svelte-markdown/extensions/katex";
  import { setContext } from "svelte";
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
    /**
     * 整条消息是否仍在流式输出。
     * 注意：这是**文档级**上界，不代表每个 code block 的完成状态；
     * CodeBlock 会结合本块围栏是否闭合来判断，不直接使用这个布尔。
     */
    streaming?: boolean;
    renderers?: MarkdownRenderers;
  } = $props();

  // ── 流式状态注入 ─────────────────────────────────────────
  // 通过 Svelte Context 把"文档级流式"注入给所有 ext 渲染器（尤其是 CodeBlock）。
  // 用 $state 包裹保证下游（getContext 后）在变更时响应更新。
  //
  // 语义：这里只放 `documentStreaming` 一个字段。它只表示"整条消息是否还在流"，
  // 作为下游"本块是否已完成"推导的**上界**；下游不应直接据此禁用/开放复制，
  // 而是结合本块围栏是否闭合综合判断（详见 MarkdownStreamingState 注释）。
  const streamingState: MarkdownStreamingState = $state({
    documentStreaming: false,
  });
  setContext(MARKDOWN_STREAMING_KEY, streamingState);
  $effect(() => {
    streamingState.documentStreaming = streaming;
  });

  let error = $derived(isError ?? message.isError ?? false);
  let proseClass = $derived(error ? errorProse : normalProse);

  let renderers = $derived<MarkdownRenderers>({
    link: Link,
    image: Media,
    //@ts-expect-error Katex 类型未导出，保留原写法
    inlineKatex: KatexRenderer,
    blockKatex: KatexRenderer,
    code: CodeBlock, //HighlightedCode,
    ...renderersProp,
    html: {
      ...Html,
      thinking: Thinking,
      ...(renderersProp.html ?? {}),
    } satisfies HtmlRenderers,
  });

  let extensions = [markedKatex()];

  // ── Markdown 外观（来自 configStore） ─────────────────────
  // 字体栈集中在此处映射：schema 仅存语义 key，方便将来切换
  const FONT_STACKS: Record<MarkdownFontFamily, string> = {
    system:
      "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans SC', 'Noto Sans', 'PingFang SC', 'Hiragino Sans', 'Microsoft YaHei', 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif",
    sans: "'Inter', 'Source Sans Pro', 'Noto Sans SC', 'Noto Sans', 'PingFang SC', 'Hiragino Sans', 'Microsoft YaHei', system-ui, sans-serif",
    serif:
      "'Source Serif Pro', 'Source Serif 4', 'Noto Serif SC', Georgia, 'Songti SC', 'SimSun', 'Times New Roman', serif",
  };

  let fontFamily = $derived(
    FONT_STACKS[configStore.markdownFontFamily] ?? FONT_STACKS.system,
  );
  let fontSize = $derived(
    configStore.markdownFontSize > 0 ? configStore.markdownFontSize : 15,
  );
  let lineHeight = $derived(
    configStore.markdownLineHeight > 0 ? configStore.markdownLineHeight : 1.7,
  );
  let codeSize = $derived(
    configStore.markdownCodeFontSize > 0
      ? configStore.markdownCodeFontSize
      : 13,
  );
  let maxWidth = $derived(configStore.markdownMaxWidth);
</script>

<div
  class={[
    "prose prose-sm w-full min-w-0 max-w-none wrap-break-word select-text",
    proseClass,
  ]}
  style:font-family={fontFamily}
  style:font-size={`${fontSize}px`}
  style:line-height={lineHeight}
  style:max-width={maxWidth > 0 ? `${maxWidth}px` : "none"}
  style:--md-code-size={`${codeSize}px`}
>
  <SvelteMarkdown
    source={message.content}
    {renderers}
    {extensions}
    {streaming}
  />
  {#if streaming && !error}
    <span
      class="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-primary align-middle"
      aria-hidden="true"
    ></span>
  {/if}
</div>
