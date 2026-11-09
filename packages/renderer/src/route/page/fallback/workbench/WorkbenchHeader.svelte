<!-- 工作台头部：任务信息 + 当前对话操作 toolbar（目录 / 思考显隐 / 收起全部 / 清空） -->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import { safeApi } from "$lib/utils/api";
  import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconEye,
    IconEyeOff,
    IconFolderOpen,
    IconTrash,
  } from "@tabler/icons-svelte";

  let { onClear = () => {} }: { onClear?: () => void } = $props();

  let openingFolder = $state(false);

  async function openFolder() {
    if (!projectStore.path || openingFolder) return;
    openingFolder = true;
    try {
      await safeApi().system.showItemInFolder({
        path: [projectStore.path, "meta"],
      });
    } finally {
      openingFolder = false;
    }
  }

  let icon = $derived(projectStore.activity?.icon ?? "IconMessageCircle");
  let hasMessages = $derived(messageStore.hasMessages);
  let busy = $derived(messageStore.isLoading || messageStore.isReloading);
  let tracesVisible = $derived(messageStore.tracesVisible);

  let allCollapsed = $derived.by(() => {
    const msgs = messageStore.messages;
    if (msgs.length === 0) return false;
    return msgs.every((msg) => messageStore.collapsedMessages[msg.id] === true);
  });
</script>

<header class="shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-sm">
  <div class="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
    <!-- 左：图标 + 任务名 + 会话 ID -->
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background"
      >
        <RuntimeIcon name={icon} size={18} stroke={1.5} class="text-primary" />
      </div>

      <div class="flex min-w-0 flex-col leading-tight">
        <h1 class="truncate text-sm font-medium text-foreground">
          {projectStore.activity?.header.title ?? "Agent 对话"}
        </h1>

        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          {#if projectStore.activity?.header.detail}
            <span class="truncate">
              {projectStore.activity.header.detail}
            </span>
          {/if}
        </div>
      </div>
    </div>

    <!-- 右：当前对话操作 toolbar（icon-only） -->
    <div class="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        onclick={openFolder}
        disabled={openingFolder || !projectStore.path}
        title="打开项目目录"
        aria-label="打开项目目录"
        class="size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:text-foreground"
      >
        <IconFolderOpen size={16} stroke={1.5} />
      </Button>

      {#if hasMessages}
        <Button
          variant="ghost"
          size="icon"
          onclick={() => messageStore.toggleTracesVisible()}
          disabled={busy}
          title={tracesVisible ? "隐藏全部思考信息" : "显示全部思考信息"}
          aria-label={tracesVisible ? "隐藏全部思考信息" : "显示全部思考信息"}
          aria-pressed={tracesVisible}
          class="size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:text-foreground"
        >
          {#if tracesVisible}
            <IconEye size={16} stroke={1.5} />
          {:else}
            <IconEyeOff size={16} stroke={1.5} />
          {/if}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onclick={() => messageStore.toggleAllMessages()}
          disabled={busy}
          title={allCollapsed ? "展开全部消息" : "收起全部消息"}
          aria-label={allCollapsed ? "展开全部消息" : "收起全部消息"}
          class="size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:text-foreground"
        >
          {#if allCollapsed}
            <IconArrowsMaximize size={16} stroke={1.5} />
          {:else}
            <IconArrowsMinimize size={16} stroke={1.5} />
          {/if}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onclick={onClear}
          disabled={busy}
          title="清空对话"
          aria-label="清空对话"
          class="size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
        >
          <IconTrash size={16} stroke={1.5} />
        </Button>
      {/if}
    </div>
  </div>
</header>
