<!-- 工作台头部：任务名 · 会话ID · 打开目录 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { sessionStore } from "$lib/store/local/session.store.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import { safeApi } from "$lib/utils/api";
  import {
    IconBolt,
    IconCheck,
    IconCopy,
    IconFolderOpen,
  } from "@tabler/icons-svelte";

  let copied = $state(false);
  let openingFolder = $state(false);

  let sessionId = $derived(sessionStore.activeSessionId ?? "");
  let shortSession = $derived(sessionId ? sessionId.slice(0, 8) : "");

  async function openFolder() {
    if (!projectStore.path || openingFolder) return;
    openingFolder = true;
    try {
      await safeApi().system.showItemInFolder({ path: projectStore.path });
    } finally {
      openingFolder = false;
    }
  }

  async function copySession() {
    if (!sessionId) return;
    await navigator.clipboard.writeText(sessionId);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<header class="shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-sm">
  <div class="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
    <!-- 左：图标 + 任务名 + 会话 ID -->
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background"
      >
        <IconBolt size={18} stroke={1.5} class="text-primary" />
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

          {#if shortSession}
            <span class="shrink-0 text-border">·</span>
            <button
              type="button"
              onclick={copySession}
              title={`Session ${sessionId}`}
              aria-label="复制会话 ID"
              class="group flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono transition-colors hover:bg-muted hover:text-foreground"
            >
              <span>#{shortSession}</span>
              {#if copied}
                <IconCheck size={12} stroke={1.5} class="text-primary" />
              {:else}
                <IconCopy
                  size={12}
                  stroke={1.5}
                  class="opacity-0 transition-opacity group-hover:opacity-100"
                />
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- 右：打开任务目录 -->
    <div class="flex shrink-0 items-center gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        onclick={openFolder}
        disabled={openingFolder || !projectStore.path}
        title="打开任务目录"
        aria-label="打开任务目录"
        class="gap-1.5 rounded-xl"
      >
        <IconFolderOpen size={16} stroke={1.5} />
        <span class="hidden sm:inline">目录</span>
      </Button>
    </div>
  </div>
</header>
