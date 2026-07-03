<!-- src/lib/components/chat/ChatMessageList.svelte -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import autoAnimate from "@formkit/auto-animate";
  import { IconSparkles } from "@tabler/icons-svelte";
  import { onMount, tick } from "svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import { messageStore } from "./msg.svelte";

  let {
    emptyTitle = "开始新对话",
    emptyDescription = "在下方输入框中提出你的问题，我会尽力为你解答",
  }: {
    emptyTitle?: string;
    emptyDescription?: string;
  } = $props();

  let scrollContainer: HTMLDivElement;
  let shouldAutoScroll = $state(true);

  // Auto-scroll to bottom when new messages arrive
  $effect(() => {
    // React to messages or isLoading changes
    void messageStore.messages;
    void messageStore.isLoading;

    if (shouldAutoScroll && scrollContainer) {
      tick().then(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  });

  function handleScroll() {
    if (!scrollContainer) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Enable auto-scroll if user is within 100px of bottom
    shouldAutoScroll = distanceFromBottom < 100;
  }

  onMount(() => {
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });
</script>

<div
  bind:this={scrollContainer}
  onscroll={handleScroll}
  class="flex-1 overflow-y-auto"
  style="scrollbar-width: thin; scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;"
>
  <div class="min-h-full" use:autoAnimate>
    {#if messageStore.messages.length === 0}
      <!--╭─────────────────────────────────────────────────────╮ -->
      <!-- │ [可抽取子组件 → ChatEmptyState.svelte]              │ -->
      <!-- │ 职责：空状态占位，引导用户开始对话                  │ -->
      <!-- ╰─────────────────────────────────────────────────────╯ -->
      <div
        class="flex h-full flex-col items-center justify-center px-6 py-16 text-center"
      >
        <div
          class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted/50 transition-all duration-200"
        >
          <IconSparkles size={28} stroke={1.5} class="text-muted-foreground" />
        </div>
        <h3 class="text-base font-medium text-foreground">{emptyTitle}</h3>
        <p class="mt-2 max-w-sm text-sm text-muted-foreground">
          {emptyDescription}
        </p>
      </div>
      <!-- ╭─── / ChatEmptyState ───╮ -->
    {:else}
      {#each messageStore.messages as message, index (message.id + index)}
        <ChatMessage {message} />
      {/each}

      {#if messageStore.isLoading}
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → ChatLoadingSkeleton.svelte]         │ -->
        <!-- │ 职责：AI 回复加载中的骨架屏占位                     │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <div class="flex gap-3 bg-muted/30 px-4 py-3 animate-fade-in">
          <Skeleton class="size-8 shrink-0 rounded-xl" />
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton class="h-4 w-20 rounded-lg" />
            <Skeleton class="h-20 w-full rounded-xl" />
          </div>
        </div>
        <!-- ╭─── / ChatLoadingSkeleton ───╮ -->
      {/if}
    {/if}
  </div>
</div>

<style>
  div::-webkit-scrollbar {
    width: 8px;
  }

  div::-webkit-scrollbar-track {
    background: transparent;
  }

  div::-webkit-scrollbar-thumb {
    background-color: hsl(var(--muted-foreground) / 0.3);
    border-radius: 12px;
  }

  div::-webkit-scrollbar-thumb:hover {
    background-color: hsl(var(--muted-foreground) / 0.5);
  }
</style>
