<!-- 助手消息 · traces + 流式 markdown · 操作内联到 header（无右键菜单） -->
<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { Button } from "$lib/components/ui/button";
  import type { ChatMessage } from "$lib/store/local/chat.types";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCopy,
    IconLoader2,
    IconRobot,
    IconTrash,
  } from "@tabler/icons-svelte";
  import TypingDots from "../TypingDots.svelte";
  import { confirmDeleteMessage } from "../confirm.svelte";
  import AgentTrace from "../trace/AgentTrace.svelte";

  let { message }: { message: ChatMessage } = $props();

  let copied = $state(false);
  let collapsed = $derived(messageStore.collapsedMessages[message.id] === true);
  let deleting = $derived(messageStore.deletingMessages[message.id] === true);

  let hasContent = $derived(message.content.length > 0);
  let hasTraces = $derived((message.traces?.length ?? 0) > 0);

  // 是否实际渲染 trace 由全局开关统一控制
  let showingTraces = $derived(hasTraces && messageStore.tracesVisible);

  // 无内容且（无 trace 或 trace 被全局隐藏）时才显示 shimmer
  let showShimmer = $derived(
    message.streaming && !hasContent && !showingTraces,
  );

  // 递归检测 trace 树中是否存在仍在运行的节点
  function hasRunningTrace(traces?: ChatMessage["traces"]): boolean {
    if (!traces || traces.length === 0) return false;
    for (const node of traces) {
      if (node.status === "running" && node.streaming !== false) return true;
      if (node.kind === "agent" && hasRunningTrace(node.children)) return true;
    }
    return false;
  }

  let traceRunning = $derived(hasRunningTrace(message.traces));

  /**
   * 思考骨架自动展开条件（主流 Agent 模式）：
   * - 消息正在流式生成（历史加载的消息 streaming 为 false → 全部收起）；
   * - 尚未输出正文内容（一旦开始输出正文 → 全部收起）；
   * - 思考仍在进行中（存在 running trace，思考结束 → 全部收起）。
   * 三者同时成立时，才允许自动展开有子节点的 trace 节点。
   */
  let autoExpand = $derived(
    message.streaming === true && message.content.length === 0 && traceRunning,
  );

  function copy() {
    if (!hasContent) return;
    navigator.clipboard?.writeText(message.content);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function toggleCollapse() {
    messageStore.toggleMessage(message.id);
  }

  async function deleteMessage() {
    const ok = await confirmDeleteMessage();
    if (!ok) return;
    await messageStore.deleteMessage(message.id);
  }
</script>

<div class="group/msg flex min-w-0 flex-col gap-2" use:autoAnimate>
  <!-- Header：Robot图标 → AI → 按钮区 -->
  <div class="flex min-w-0 items-center gap-2">
    <div
      class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
    >
      <IconRobot size={15} stroke={1.5} />
    </div>

    <span class="shrink-0 text-xs font-medium text-foreground">AI</span>

    <div
      class="flex min-w-0 items-center gap-0.5 transition-opacity duration-200 {deleting
        ? 'opacity-100'
        : 'opacity-0 group-hover/msg:opacity-100'}"
    >
      <!-- 删除 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={deleteMessage}
        disabled={messageStore.isLoading || deleting}
        class="group size-6 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive active:scale-90 active:bg-destructive/20"
        aria-label={deleting ? "正在删除…" : "删除消息"}
        title={deleting ? "正在删除…" : "删除消息"}
      >
        {#if deleting}
          <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
        {:else}
          <IconTrash
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {/if}
      </Button>

      <!-- 折叠 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={toggleCollapse}
        class="group size-6 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80"
        aria-label={collapsed ? "展开消息" : "折叠消息"}
        title={collapsed ? "展开消息" : "折叠消息"}
      >
        {#if collapsed}
          <IconChevronDown
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {:else}
          <IconChevronUp
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {/if}
      </Button>

      <!-- 复制 -->
      <Button
        variant="ghost"
        size="icon"
        onclick={copy}
        disabled={!hasContent}
        class="group size-6 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 disabled:opacity-30"
        aria-label="复制消息内容"
        title="复制消息内容"
      >
        {#if copied}
          <IconCheck
            size={14}
            stroke={1.5}
            class="text-primary transition-transform duration-200 group-active:scale-110"
          />
        {:else}
          <IconCopy
            size={14}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        {/if}
      </Button>
    </div>
  </div>

  {#if collapsed}
    <button
      type="button"
      onclick={toggleCollapse}
      class="flex items-center gap-2 self-start rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground active:scale-95"
    >
      <IconChevronDown size={14} stroke={1.5} />
      <span>消息已折叠 · 点击展开</span>
    </button>
  {:else}
    {#if showingTraces}
      <AgentTrace nodes={message.traces ?? []} {autoExpand} />
    {/if}

    {#if hasContent}
      <div
        class={[
          "min-w-0 rounded-2xl p-3 text-sm leading-relaxed wrap-break-word",
          message.isError
            ? "border border-destructive/30 bg-destructive/5"
            : "border border-border/50 bg-muted/40 text-foreground",
        ]}
      >
        <MarkdownView {message} streaming={message.streaming} />
      </div>
    {:else if showShimmer}
      <div
        class="flex items-center rounded-2xl border border-border/50 bg-muted/40 px-3 py-2.5"
      >
        <TypingDots label="正在思考" />
      </div>
    {/if}
  {/if}
</div>
