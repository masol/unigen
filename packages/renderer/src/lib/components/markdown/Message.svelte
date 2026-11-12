<!-- Message.svelte（全文） -->
<script module lang="ts">
  import { setCodeHighlighter } from "@humanspeak/svelte-markdown/extensions/highlight";
  import {
    createTanstackHighlighter
  } from "@humanspeak/svelte-markdown/extensions/tanstack-highlight";
  import CodeBlock from "./ext/CodeBlock.svelte";

  // 从 TanStack 官方子路径导入语言定义对象（LanguageDefinition）
  // 注意：bash 是 shell 的别名，不存在独立的 bash 模块。
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
  } from "$lib/components/markdown/type";
  import SvelteMarkdown, {
    Html,
    type HtmlRenderers,
  } from "@humanspeak/svelte-markdown";
  import {
    KatexRenderer,
    markedKatex,
  } from "@humanspeak/svelte-markdown/extensions/katex";
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
</script>

<div
  class={[
    "prose prose-sm w-full min-w-0 max-w-none wrap-break-word select-text",
    proseClass,
  ]}
  style="font-family: system-ui, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;"
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
