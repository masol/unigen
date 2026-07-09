<!-- src/lib/components/chat/ChatMessage.svelte -->
<script lang="ts">
  import * as Avatar from "$lib/components/ui/avatar";
  import { Button } from "$lib/components/ui/button";
  import { Markdown } from "$lib/components/ui/markdown";
  import {
    IconCheck,
    IconCopy,
    IconRobot,
    IconUser,
  } from "@tabler/icons-svelte";
  import type { Message } from "./msg.svelte";

  let { message }: { message: Message } = $props();

  let copied = $state(false);

  function handleCopy() {
    navigator.clipboard.writeText(message.content);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1000);
  }

  function formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return date.toLocaleDateString("zh-CN");
  }

  let isUser = $derived(message.role === "user");
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → ChatMessageBubble.svelte]           │ -->
<!-- │ 职责：单条消息气泡，含头像、内容、时间戳与复制按钮  │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div
  class="group flex gap-3 px-4 py-3 transition-all duration-200 animate-fade-in {isUser
    ? 'bg-transparent'
    : 'bg-muted/30'}"
>
  <Avatar.Root class="size-8 shrink-0 rounded-xl border border-border/50">
    <Avatar.Fallback
      class="rounded-xl {isUser
        ? 'bg-primary/10 text-primary'
        : 'bg-accent text-muted-foreground'}"
    >
      {#if isUser}
        <IconUser size={16} stroke={1.5} />
      {:else}
        <IconRobot size={16} stroke={1.5} />
      {/if}
    </Avatar.Fallback>
  </Avatar.Root>

  <div class="flex min-w-0 flex-1 flex-col gap-2">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium">
        {isUser ? "你" : "AI 助手"}
      </span>
      <span class="text-xs text-muted-foreground">
        {formatTime(message.timestamp)}
      </span>
    </div>

    <div
      class="prose prose-sm max-w-none text-sm text-foreground **:text-foreground [&_code]:text-foreground"
    >
      <Markdown content={message.content} />
    </div>

    <div
      class="flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    >
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
        onclick={handleCopy}
      >
        {#if copied}
          <IconCheck size={14} stroke={1.5} />
          <span>已复制</span>
        {:else}
          <IconCopy size={14} stroke={1.5} />
          <span>复制</span>
        {/if}
      </Button>
    </div>
  </div>
</div>
<!-- ╭─── / ChatMessageBubble ───╮ -->
