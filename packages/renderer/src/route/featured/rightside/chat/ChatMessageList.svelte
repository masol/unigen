<!-- src/lib/components/chat/ChatMessageList.svelte -->
<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconSparkles } from "@tabler/icons-svelte";
  import autoAnimate from "@formkit/auto-animate";
  import ChatMessage from "./ChatMessage.svelte";
  import type { Message } from "./msg.svelte";

  let {
    messages = [],
    isLoading = false,
    emptyTitle = "开始新对话",
    emptyDescription = "在下方输入框中提出你的问题，我会尽力为你解答",
  }: {
    messages?: Message[];
    isLoading?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
  } = $props();
</script>

<ScrollArea class="flex-1 p-6">
  <div class="space-y-6" use:autoAnimate>
    {#if messages.length === 0}
      <div
        class="flex h-full flex-col items-center justify-center py-12 text-center"
      >
        <div
          class="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50 transition-all duration-200"
        >
          <IconSparkles size={32} stroke={1.5} class="text-muted-foreground" />
        </div>
        <h3 class="text-lg font-medium text-foreground">{emptyTitle}</h3>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          {emptyDescription}
        </p>
      </div>
    {:else}
      {#each messages as message (message.id)}
        <ChatMessage {message} />
      {/each}

      {#if isLoading}
        <div class="flex gap-4 animate-fade-in">
          <Skeleton class="size-8 shrink-0 rounded-xl" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-4 w-24 rounded-lg" />
            <Skeleton class="h-24 w-full rounded-2xl" />
          </div>
        </div>
      {/if}
    {/if}
  </div>
</ScrollArea>
