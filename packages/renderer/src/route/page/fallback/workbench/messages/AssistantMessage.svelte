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
    IconEye,
    IconEyeOff,
    IconGitBranch,
    IconLoader2,
    IconRefresh,
    IconRobot,
    IconTrash,
  } from "@tabler/icons-svelte";
  import { toast } from "svelte-sonner";
  import TypingDots from "../TypingDots.svelte";
  import AgentTrace from "../trace/AgentTrace.svelte";

  let { message }: { message: ChatMessage } = $props();

  let copied = $state(false);
  let collapsed = $derived(messageStore.collapsedMessages[message.id] === true);
  let traceVisible = $state(true);

  let hasContent = $derived(message.content.length > 0);
  let hasTraces = $derived((message.traces?.length ?? 0) > 0);
  let showShimmer = $derived(message.streaming && !hasContent && !hasTraces);

  // 递归检测trace树中是否存在running节点
  function hasRunningTrace(traces?: typeof message.traces): boolean {
    if (!traces || traces.length === 0) return false;
    for (const node of traces) {
      if (node.status === "running") return true;
      if (node.kind === "agent" && hasRunningTrace(node.children)) return true;
    }
    return false;
  }

  let traceRunning = $derived(hasRunningTrace(message.traces));

  function copy() {
    if (!hasContent) return;
    navigator.clipboard?.writeText(message.content);
    copied = true;
    setTimeout(() => (copied = false), 1500);
    toast.success("已复制");
  }

  function toggleCollapse() {
    messageStore.toggleMessage(message.id);
  }

  function toggleTrace() {
    traceVisible = !traceVisible;
  }

  function regenerate() {
    const store = messageStore as unknown as {
      regenerate?: (id: string) => Promise<void>;
    };
    if (store.regenerate) store.regenerate(message.id);
    else toast.warning("regenerate 尚未实现");
  }

  function forkFromHere() {
    const store = messageStore as unknown as {
      forkFrom?: (id: string) => Promise<void>;
    };
    if (store.forkFrom) store.forkFrom(message.id);
    else toast.warning("forkFrom 尚未实现");
  }

  function deleteMessage() {
    const store = messageStore as unknown as {
      deleteMessage?: (id: string) => void;
    };
    if (store.deleteMessage) store.deleteMessage(message.id);
    else toast.warning("deleteMessage 尚未实现");
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="block">
    <div class="group/msg flex min-w-0 flex-col gap-2">
      <!-- Header：Robot图标 → AI → 按钮区 → agent名称，全部在一行 -->
      <div class="flex min-w-0 items-center gap-2">
        <!-- Robot 图标 - 直接用圆形背景包裹，不用 Chat.BubbleAvatar -->
        <div
          class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <IconRobot size={15} stroke={1.5} />
        </div>

        <!-- AI 文字 - 固定显示 -->
        <span class="shrink-0 text-xs font-medium text-foreground">AI</span>

        <!-- 功能按钮区 + agent名称 - hover显示 -->
        <div
          class="flex min-w-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100"
        >
          {#if hasTraces}
            <Button
              variant="ghost"
              size="icon"
              onclick={toggleTrace}
              class="size-6 shrink-0 rounded-lg text-muted-foreground transition-all duration-200 hover:text-foreground"
              aria-label={traceVisible ? "隐藏进度" : "显示进度"}
              title={traceVisible ? "隐藏进度" : "显示进度"}
            >
              {#if traceVisible}
                <IconEye size={14} stroke={1.5} />
              {:else if traceRunning}
                <IconLoader2 size={14} stroke={1.5} class="animate-spin" />
              {:else}
                <IconEyeOff size={14} stroke={1.5} />
              {/if}
            </Button>
          {/if}

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

          <!-- {#if message.agent?.name && message.agent.name !== "AI"}
            <span class="shrink-0 text-xs text-muted-foreground">
              ({message.agent.name})
            </span>
          {/if}
          {#if message.agent?.model}
            <span
              class="min-w-0 truncate font-mono text-xs text-muted-foreground"
            >
              {message.agent.model}
            </span>
          {/if} -->
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
        {#if hasTraces && traceVisible}
          <AgentTrace nodes={message.traces ?? []} />
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
