<!-- 工作台头部：任务名 · 会话ID · 打开目录 -->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import { projectStore } from "$lib/store/project.svelte";
  import { safeApi } from "$lib/utils/api";
  import { IconFolderOpen } from "@tabler/icons-svelte";

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

    <!-- 右：打开项目目录 -->
    <div class="flex shrink-0 items-center gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        onclick={openFolder}
        disabled={openingFolder || !projectStore.path}
        title="打开项目目录"
        aria-label="打开项目目录"
        class="gap-1.5 rounded-xl"
      >
        <IconFolderOpen size={16} stroke={1.5} />
        <span class="hidden sm:inline">目录</span>
      </Button>
    </div>
  </div>
</header>
