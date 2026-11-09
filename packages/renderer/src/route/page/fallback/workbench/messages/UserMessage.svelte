<!-- 用户消息气泡 · 右对齐 · ContextMenu 增强 -->
<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Chat from "$lib/components/ui/chat";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import type { ChatMessage } from "$lib/store/local/chat.types";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCopy,
    IconGitBranch,
    IconRepeat,
    IconTrash,
    IconUser,
  } from "@tabler/icons-svelte";
  import MessageHeader from "./MessageHeader.svelte";

  let { message }: { message: ChatMessage } = $props();

  let copied = $state(false);
  let collapsed = $derived(messageStore.collapsedMessages[message.id] === true);

  function copy() {
    navigator.clipboard?.writeText(message.content);
    copied = true;
    setTimeout(() => (copied = false), 1500);
    // toast.success("已复制");
  }

  function toggleCollapse() {
    messageStore.toggleMessage(message.id);
  }

  function resendFromHere() {
    void messageStore.resendFrom(message.id);
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
    <!-- 展开/收起时对内容块 ↔ 折叠按钮之间的增删使用 autoAnimate 平滑过渡 -->
    <div class="group/msg flex min-w-0 flex-col gap-1.5" use:autoAnimate>
      <MessageHeader role="user">
        {#snippet identity()}
          <span class="text-xs font-medium text-muted-foreground">你</span>
          <Chat.BubbleAvatar class="size-6 shrink-0">
            <Chat.BubbleAvatarFallback class="bg-primary/10 text-primary">
              <IconUser size={15} stroke={1.5} />
            </Chat.BubbleAvatarFallback>
          </Chat.BubbleAvatar>
        {/snippet}
        {#snippet actions()}
          <Button
            variant="ghost"
            size="icon"
            onclick={copy}
            class="size-6 rounded-lg text-muted-foreground opacity-0 transition-all duration-200 hover:text-foreground group-hover/msg:opacity-100"
            aria-label="复制消息内容"
          >
            {#if copied}
              <IconCheck size={14} stroke={1.5} class="text-primary" />
            {:else}
              <IconCopy size={14} stroke={1.5} />
            {/if}
          </Button>
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
        {/snippet}
      </MessageHeader>

      {#if !collapsed}
        <div
          class="min-w-0 rounded-2xl border border-primary/15 bg-primary/8 p-3 text-sm leading-relaxed text-foreground wrap-break-word"
        >
          <MarkdownView {message} />
        </div>
      {:else}
        <button
          type="button"
          onclick={toggleCollapse}
          class="flex items-center gap-2 self-end rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground"
        >
          <IconChevronDown size={14} stroke={1.5} />
          <span>消息已折叠 · 点击展开</span>
        </button>
      {/if}
    </div>
  </ContextMenu.Trigger>

  <ContextMenu.Content class="w-48">
    <ContextMenu.Item onclick={copy}>
      <IconCopy size={14} stroke={1.5} />
      <span>复制内容</span>
    </ContextMenu.Item>
    <ContextMenu.Item
      onclick={resendFromHere}
      disabled={messageStore.isLoading}
    >
      <IconRepeat size={14} stroke={1.5} />
      <span>从此重新发送</span>
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
