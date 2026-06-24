<!-- src/lib/components/chat/ChatMessage.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Avatar from "$lib/components/ui/avatar";
  import { Markdown } from "$lib/components/ui/markdown";
  import {
    IconCopy,
    IconCheck,
    IconUser,
    IconRobot,
  } from "@tabler/icons-svelte";
  import type { Message } from "./msg.svelte";

  let {
    message,
  }: {
    message: Message;
  } = $props();

  let copied = $state(false);

  function handleCopy() {
    navigator.clipboard.writeText(message.content);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
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
</script>

<div class="group flex gap-4 animate-fade-in">
  <Avatar.Root class="size-8 shrink-0 rounded-xl border border-border/50">
    <Avatar.Fallback
      class="rounded-xl {message.role === 'user'
        ? 'bg-primary/10 text-primary'
        : 'bg-muted text-muted-foreground'}"
    >
      {#if message.role === "user"}
        <IconUser size={16} stroke={1.5} />
      {:else}
        <IconRobot size={16} stroke={1.5} />
      {/if}
    </Avatar.Fallback>
  </Avatar.Root>

  <div class="flex-1 space-y-2">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium">
        {message.role === "user" ? "你" : "AI 助手"}
      </span>
      <span class="text-xs text-muted-foreground">
        {formatTime(message.timestamp)}
      </span>
    </div>

    <div
      class="prose prose-sm max-w-none rounded-2xl border border-border/50 bg-muted/30 p-4 text-sm text-foreground transition-all duration-200 group-hover:border-border/80 group-hover:shadow-sm"
    >
      <Markdown content={message.content} />
    </div>

    <div
      class="flex items-center gap-2 opacity-0 transition-all group-hover:opacity-100"
    >
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-2 rounded-lg px-3 text-xs"
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
