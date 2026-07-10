<!-- src/lib/components/chat/ChatMessage.svelte -->
<script lang="ts">
  import type {
    MarkdownRenderers,
    Message,
  } from "$lib/components/markdown/type";
  import SvelteMarkdown, {
    Html,
    type HtmlRenderers,
  } from "@humanspeak/svelte-markdown";
  import { IconAlertTriangle } from "@tabler/icons-svelte";
  import ChatLink from "./ext/ChatLink.svelte";
  import ChatThinking from "./ext/ChatThinking.svelte";

  let {
    message,
    isError,
    streaming = false,
    renderers: renderersProp = {},
  }: {
    message: Message;
    isError?: boolean;
    streaming?: boolean;
    renderers?: MarkdownRenderers;
  } = $props();

  // ── 两个正交真源：role 决定归属；error 决定错误风格 ──
  let error = $derived(isError ?? message.isError ?? false);

  // ── prose 配色 ──────────────────────────────────────────────────
  // 设计决策：用户与助手都使用「常规 foreground 前景」，仅靠 list 的气泡
  // 底色区分归属，避免高对比实心反色气泡（light 大黑底 / dark 大白底）。
  // 因此 user / assistant 的 prose 结构几乎一致，共用 baseProse。
  //
  // baseProse：结构性规则（换行、代码块滚动），三种风格共用。
  const baseProse = [
    "**:text-foreground", // 文本统一常规前景
    "[&_code]:break-words", // 行内 code 可换行
    "[&_pre]:w-full [&_pre]:min-w-0 [&_pre]:overflow-x-auto", // 代码块内部横向滚动，不撑破父级
    "[&_pre_code]:whitespace-pre", // 块内 code 保留原格式
    "[&_hr]:border-border/60",
    "[&_th]:border-border/60 [&_td]:border-border/40",
  ].join(" ");

  // 常规风格（user + assistant 共用）
  const normalProse = [
    baseProse,
    "text-foreground",
    "[&_a]:text-primary",
    "[&_code]:text-foreground [&_code]:bg-muted",
    "[&_pre]:bg-muted/70 [&_pre]:text-foreground",
    "[&_blockquote]:border-border [&_blockquote]:text-muted-foreground",
  ].join(" ");

  // 错误风格（覆盖前景为 destructive）
  const errorProse = [
    baseProse,
    "text-destructive **:text-destructive",
    "[&_a]:text-destructive [&_a]:underline",
    "[&_code]:text-destructive [&_code]:bg-destructive/10",
    "[&_pre]:bg-destructive/10 [&_pre]:text-destructive",
    "[&_blockquote]:border-destructive/40 [&_blockquote]:text-destructive/90",
  ].join(" ");

  let proseClass = $derived(error ? errorProse : normalProse);

  // ── renderers：预置链接 & <thinking>，外部可覆盖 ────────────────
  // 顶层 key（link/code/heading…）：外部传入者优先；
  // html 子键：与内置 Html 合并，外部再覆盖。
  let renderers = $derived<MarkdownRenderers>({
    link: ChatLink,
    ...renderersProp,
    html: {
      ...Html,
      thinking: ChatThinking,
      ...(renderersProp.html ?? {}),
    } satisfies HtmlRenderers,
  });
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → ChatMessageBody.svelte]             │ -->
<!-- │ 职责：仅渲染消息本体（markdown/HTML）；配色真源 =    │ -->
<!-- │       error 标志；归属由 list 气泡底色区分          │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
{#if error}
  <div class="flex w-full items-start gap-2.5">
    <IconAlertTriangle
      size={18}
      stroke={1.5}
      class="mt-0.5 shrink-0 text-destructive"
    />
    <div
      class={[
        "prose prose-sm min-w-0 max-w-none flex-1 wrap-break-word",
        errorProse,
      ]}
    >
      <SvelteMarkdown source={message.content} {renderers} {streaming} />
    </div>
  </div>
{:else}
  <div
    class={[
      "prose prose-sm w-full min-w-0 max-w-none wrap-break-word",
      proseClass,
    ]}
  >
    <SvelteMarkdown source={message.content} {renderers} {streaming} />
  </div>
{/if}
<!-- ╭─── / ChatMessageBody ───╮ -->
