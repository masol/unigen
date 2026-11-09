<!-- 助手消息 · traces + 流式 markdown + ContextMenu 增强 -->
<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import type { ChatMessage } from "$lib/store/local/chat.types";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCopy,
    IconGitBranch,
    IconRefresh,
    IconRobot,
    IconTrash,
  } from "@tabler/icons-svelte";
  import TypingDots from "../TypingDots.svelte";
  import AgentTrace from "../trace/AgentTrace.svelte";

  let { message }: { message: ChatMessage } = $props();

  let copied = $state(false);
  let collapsed = $derived(messageStore.collapsedMessages[message.id] === true);

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
    // toast.success("已复制");
  }

  function toggleCollapse() {
    messageStore.toggleMessage(message.id);
  }

  function regenerate() {
    void messageStore.regenerate(message.id);
  }

  function forkFromHere() {
    void messageStore.forkFrom(message.id);
  }

  function deleteMessage() {
    messageStore.deleteMessage(message.id);
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="block">
    <div class="group/msg flex min-w-0 flex-col gap-2">
      <!-- Header：Robot图标 → AI → 按钮区 -->
      <div class="flex min-w-0 items-center gap-2">
        <!-- Robot 图标 - 直接用圆形背景包裹 -->
        <div
          class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <IconRobot size={15} stroke={1.5} />
        </div>

        <!-- AI 文字 - 固定显示 -->
        <span class="shrink-0 text-xs font-medium text-foreground">AI</span>

        <!-- 功能按钮区 - hover显示 -->
        <div
          class="flex min-w-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100"
        >
          <Button
            variant="ghost"
            size="icon"
            onclick={toggleCollapse}
            class="size-6 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:text-foreground"
            aria-label={collapsed ? "展开消息" : "折叠消息"}
          >
            {#if collapsed}
              <IconChevronDown size={14} stroke={1.5} />
            {:else}
              <IconChevronUp size={14} stroke={1.5} />
            {/if}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onclick={copy}
            disabled={!hasContent}
            class="size-6 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:text-foreground disabled:opacity-30"
            aria-label="复制消息内容"
          >
            {#if copied}
              <IconCheck size={14} stroke={1.5} class="text-primary" />
            {:else}
              <IconCopy size={14} stroke={1.5} />
            {/if}
          </Button>
        </div>
      </div>

      {#if collapsed}
        <button
          type="button"
          onclick={toggleCollapse}
          class="flex items-center gap-2 self-start rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground"
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
  </ContextMenu.Trigger>

  <ContextMenu.Content class="w-48">
    <ContextMenu.Item onclick={copy} disabled={!hasContent}>
      <IconCopy size={14} stroke={1.5} />
      <span>复制内容</span>
    </ContextMenu.Item>
    <ContextMenu.Item
      onclick={regenerate}
      disabled={messageStore.isLoading || message.streaming}
    >
      <IconRefresh size={14} stroke={1.5} />
      <span>重新生成</span>
    </ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.Item onclick={forkFromHere}>
      <IconGitBranch size={14} stroke={1.5} />
      <span>从此分叉</span>
    </ContextMenu.Item>
    <ContextMenu.Item
      onclick={deleteMessage}
      disabled={messageStore.isLoading}
      class="text-destructive focus:text-destructive"
    >
      <IconTrash size={14} stroke={1.5} />
      <span>删除消息</span>
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>
