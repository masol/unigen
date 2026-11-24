<!-- 工作台头部：任务信息 + 当前对话操作 toolbar（目录 / 思考显隐 / 自动任务 / 收起全部 / 清空） -->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import {
    hasAnyAutoTask,
    readAutoTaskConfig,
  } from "$lib/store/local/sess/session.types";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import { safeApi } from "$lib/utils/api";
  import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconBolt,
    IconCheck,
    IconClock,
    IconEye,
    IconEyeOff,
    IconFilter,
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
  let busy = $derived(
    messageStore.isLoading ||
      messageStore.isReloading ||
      messageStore.isDeleting,
  );
  let tracesVisible = $derived(messageStore.tracesVisible);

  let allCollapsed = $derived.by(() => {
    const msgs = messageStore.messages;
    if (msgs.length === 0) return false;
    return msgs.every((msg) => messageStore.collapsedMessages[msg.id] === true);
  });

  // ── 自动任务：绑定当前活跃会话 ──
  const activeSession = $derived(
    sessionStore.sessions.find((s) => s.id === sessionStore.activeSessionId),
  );
  const autoTaskConfig = $derived(readAutoTaskConfig(activeSession?.extra));
  const hasAutoTask = $derived(hasAnyAutoTask(activeSession?.extra));
  const completionEnabled = $derived(
    autoTaskConfig.completion?.enabled === true,
  );

  async function handleOpenAutoTask() {
    if (!activeSession) return;
    await sessionStore.openAutoTaskDialog(activeSession.id);
  }
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
      <!-- 自动任务入口：有配置时高亮 + 右上角小圆点 -->
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              disabled={!activeSession}
              title="自动任务"
              aria-label="自动任务"
              aria-haspopup="menu"
              class={[
                "group relative size-8 rounded-lg transition-all duration-200 active:scale-90",
                hasAutoTask
                  ? "text-primary hover:bg-primary/10 hover:text-primary active:bg-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/80",
              ].join(" ")}
            >
              <IconBolt
                size={16}
                stroke={1.5}
                class="transition-transform duration-200 group-active:scale-110"
              />
              {#if hasAutoTask}
                <span
                  class="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                ></span>
              {/if}
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={4} class="w-56">
          <DropdownMenu.Group>
            <DropdownMenu.Label
              class="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              自动任务
            </DropdownMenu.Label>
            <DropdownMenu.Item
              onSelect={handleOpenAutoTask}
              class="gap-2 text-xs"
            >
              <IconBolt class="size-3.5" stroke={1.5} />
              <span class="flex-1">自动续写</span>
              {#if completionEnabled}
                <IconCheck class="size-3.5 text-primary" stroke={2} />
              {/if}
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled class="gap-2 text-xs">
              <IconClock class="size-3.5" stroke={1.5} />
              <span class="flex-1">定时任务</span>
              <span
                class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                即将推出
              </span>
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled class="gap-2 text-xs">
              <IconFilter class="size-3.5" stroke={1.5} />
              <span class="flex-1">条件任务</span>
              <span
                class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                即将推出
              </span>
            </DropdownMenu.Item>
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <Button
        variant="ghost"
        size="icon"
        onclick={openFolder}
        disabled={openingFolder || !projectStore.path}
        title="打开项目目录"
        aria-label="打开项目目录"
        class="group size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80"
      >
        <IconFolderOpen
          size={16}
          stroke={1.5}
          class="transition-transform duration-200 group-active:scale-110"
        />
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
          class="group size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80"
        >
          {#if tracesVisible}
            <IconEye
              size={16}
              stroke={1.5}
              class="transition-transform duration-200 group-active:scale-110"
            />
          {:else}
            <IconEyeOff
              size={16}
              stroke={1.5}
              class="transition-transform duration-200 group-active:scale-110"
            />
          {/if}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onclick={() => messageStore.toggleAllMessages()}
          disabled={busy}
          title={allCollapsed ? "展开全部消息" : "收起全部消息"}
          aria-label={allCollapsed ? "展开全部消息" : "收起全部消息"}
          class="group size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80"
        >
          {#if allCollapsed}
            <IconArrowsMaximize
              size={16}
              stroke={1.5}
              class="transition-transform duration-200 group-active:scale-110"
            />
          {:else}
            <IconArrowsMinimize
              size={16}
              stroke={1.5}
              class="transition-transform duration-200 group-active:scale-110"
            />
          {/if}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onclick={onClear}
          disabled={busy}
          title="清空对话"
          aria-label="清空对话"
          class="group size-8 rounded-lg text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive active:scale-90 active:bg-destructive/20"
        >
          <IconTrash
            size={16}
            stroke={1.5}
            class="transition-transform duration-200 group-active:scale-110"
          />
        </Button>
      {/if}
    </div>
  </div>
</header>
