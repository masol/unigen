<!-- src/lib/components/chat/ChatMessageList.svelte -->
<script lang="ts">
  import { stickToBottom } from "$lib/components/action/stick-to-bottom";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconArrowRight,
    IconBulb,
    IconRefresh,
    IconTargetArrow,
  } from "@tabler/icons-svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import { messageStore } from "./msg.svelte";

  let {
    onPreset = () => {},
  }: {
    onPreset?: (text: string) => void;
  } = $props();

  // 面向「AI 工作流反思/改进」的引导预设
  const presets = [
    {
      icon: IconTargetArrow,
      title: "诊断当前工作流",
      desc: "分析现有 AI 工作流可能存在的质量瓶颈",
      prompt: "请审查当前项目的 AI 工作流，指出可能影响产出质量的薄弱环节。",
    },
    {
      icon: IconRefresh,
      title: "提出改进方案",
      desc: "让助手重构工作流并说明改动原因",
      prompt:
        "请针对当前工作流提出一套具体的改进方案，并逐条说明每处改动的理由与预期收益。",
    },
    {
      icon: IconBulb,
      title: "追问改进思路",
      desc: "理解 AI 为什么这样调整",
      prompt: "你上一步为什么这样改进工作流？还有没有更优的替代做法？",
    },
  ];
</script>

<div
  class="chat-scroll min-h-0 flex-1 overflow-y-auto"
  use:stickToBottom={{ threshold: 64, smooth: true }}
>
  <div class="flex min-h-full flex-col" use:autoAnimate>
    {#if messageStore.messages.length === 0}
      <!--╭─────────────────────────────────────────────────────╮ -->
      <!-- │ [可抽取子组件 → ChatEmptyState.svelte]              │ -->
      <!-- │ 职责：空状态引导 — 说明助手用途 + 预设快捷提问      │ -->
      <!-- ╰─────────────────────────────────────────────────────╯ -->
      <div class="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div
          class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-200"
        >
          <IconRefresh size={28} stroke={1.5} />
        </div>
        <h3 class="text-center text-base font-medium text-foreground">
          工作流反思助手
        </h3>
        <p
          class="mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground"
        >
          用自然语言描述你对项目质量的期望，助手会反思并改进当前项目的 AI 工作流。你也可以随时追问它「为什么这样改」。
        </p>

        <div class="mt-8 w-full max-w-sm space-y-2.5" use:autoAnimate>
          {#each presets as p (p.title)}
            <button
              type="button"
              onclick={() => onPreset(p.prompt)}
              class="group flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background/50 p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
            >
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-all duration-200 group-hover:bg-primary/10 group-hover:text-primary"
              >
                <p.icon size={20} stroke={1.5} />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-foreground">
                  {p.title}
                </span>
                <span class="block truncate text-xs text-muted-foreground">
                  {p.desc}
                </span>
              </span>
              <IconArrowRight
                size={16}
                stroke={1.5}
                class="shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
              />
            </button>
          {/each}
        </div>
      </div>
      <!-- ╭─── / ChatEmptyState ───╮ -->
    {:else}
      {#each messageStore.messages as message, index (message.id + index)}
        <ChatMessage {message} />
      {/each}

      {#if messageStore.isLoading}
        <!--╭─────────────────────────────────────────────────────╮ -->
        <!-- │ [可抽取子组件 → ChatReflectingIndicator.svelte]     │ -->
        <!-- │ 职责：AI 反思/生成阶段的实时进度提示卡片            │ -->
        <!-- ╰─────────────────────────────────────────────────────╯ -->
        <div class="px-4 py-3 animate-fade-in" use:autoAnimate>
          <div
            class="flex gap-3 rounded-2xl border border-border/50 bg-muted/30 p-4"
          >
            <span
              class="relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <IconRefresh size={18} stroke={1.5} class="animate-spin" />
            </span>
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-foreground">
                  {messageStore.phase?.title ?? "AI 正在处理"}
                </span>
                <span class="flex gap-1">
                  <span
                    class="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]"
                  ></span>
                  <span
                    class="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]"
                  ></span>
                  <span
                    class="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]"
                  ></span>
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                {messageStore.phase?.detail ?? "工作细节可通过日志查看…"}
              </p>
              <div class="mt-1 space-y-1.5">
                <Skeleton class="h-3 w-4/5 rounded-lg" />
                <Skeleton class="h-3 w-3/5 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
        <!-- ╭─── / ChatReflectingIndicator ───╮ -->
      {/if}
    {/if}
  </div>
</div>

<style>
  .chat-scroll {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
  }
  .chat-scroll::-webkit-scrollbar {
    width: 8px;
  }
  .chat-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .chat-scroll::-webkit-scrollbar-thumb {
    background-color: hsl(var(--muted-foreground) / 0.3);
    border-radius: 12px;
  }
  .chat-scroll::-webkit-scrollbar-thumb:hover {
    background-color: hsl(var(--muted-foreground) / 0.5);
  }
</style>
