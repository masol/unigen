<!-- 助手消息 · traces + 流式 markdown + ContextMenu 增强 -->
<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Chat from "$lib/components/ui/chat";
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
  import { toast } from "svelte-sonner";
  import TypingDots from "../TypingDots.svelte";
  import AgentTrace from "../trace/AgentTrace.svelte";
  import MessageHeader from "./MessageHeader.svelte";

  let { message }: { message: ChatMessage } = $props();

  let copied = $state(false);
  let collapsed = $derived(messageStore.collapsedMessages[message.id] === true);

  let hasContent = $derived(message.content.length > 0);
  let hasTraces = $derived((message.traces?.length ?? 0) > 0);
  let showShimmer = $derived(message.streaming && !hasContent && !hasTraces);

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

<!--╭─────────────────────────────────────────────────────╮-->
<!-- │ [可抽取子组件 → MessageActionsAssistant.svelte]      │-->
<!-- │ 职责：封装助手气泡 ContextMenu 的四条命令            │-->
<!-- ╰─────────────────────────────────────────────────────╯-->
<ContextMenu.Root>
  <ContextMenu.Trigger class="block">
    <div class="group/msg flex min-w-0 flex-col gap-2">
      <MessageHeader>
        {#snippet identity()}
          <Chat.BubbleAvatar class="size-6 shrink-0">
            <Chat.BubbleAvatarFallback class="bg-muted text-muted-foreground">
              <IconRobot size={15} stroke={1.5} />
            </Chat.BubbleAvatarFallback>
          </Chat.BubbleAvatar>
          <div class="flex min-w-0 flex-1 items-baseline gap-2">
            <span class="truncate text-xs font-medium text-foreground">
              {message.agent?.name ?? "助手"}
            </span>
            {#if message.agent?.model}
              <span class="truncate font-mono text-xs text-muted-foreground">
                {message.agent.model}
              </span>
            {/if}
          </div>
        {/snippet}
        {#snippet actions()}
          <Button
            variant="ghost"
            size="icon"
            onclick={toggleCollapse}
            class="size-6 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:text-foreground group-hover/msg:opacity-100"
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
            class="size-6 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:text-foreground group-hover/msg:opacity-100 disabled:opacity-0"
            aria-label="复制消息内容"
          >
            {#if copied}
              <IconCheck size={14} stroke={1.5} class="text-primary" />
            {:else}
              <IconCopy size={14} stroke={1.5} />
            {/if}
          </Button>
        {/snippet}
      </MessageHeader>

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
        {#if hasTraces}
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
<!-- ╭─── / MessageActionsAssistant ───╮-->
