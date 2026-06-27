<!-- NovelToVideoDashboard/DashboardHeader.svelte -->
<!-- 职责：顶部品牌区 + 全局任务状态徽章。仅读 store,无本地 state。 -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import {
    IconBolt,
    IconCircleDashed,
    IconLoader2,
    IconAlertTriangle,
    IconClock,
  } from "@tabler/icons-svelte";
  import { dashboardStore } from "./dashboard.svelte";

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
</script>

<header class="flex items-center justify-between">
  <div class="flex items-center gap-4">
    <div
      class="flex size-12 items-center justify-center rounded-2xl border border-border/50 bg-card shadow-sm"
    >
      <IconBolt size={24} stroke={1.5} class="text-primary" />
    </div>
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">
        小说视频化工作台
      </h1>
      <p class="text-sm text-muted-foreground">
        输入小说 · 输出视频 · 全流程自动编排
      </p>
    </div>
  </div>

  <div class="flex items-center gap-3">
    <Badge
      variant="outline"
      class="gap-2 rounded-xl border-border/50 px-3 py-1.5 text-xs font-medium"
    >
      {#if dashboardStore.runState === "idle"}
        <IconCircleDashed
          size={14}
          stroke={1.5}
          class="text-muted-foreground"
        />
      {:else if dashboardStore.runState === "running"}
        <IconLoader2 size={14} stroke={1.5} class="animate-spin text-primary" />
      {:else}
        <IconAlertTriangle size={14} stroke={1.5} class="text-amber-500" />
      {/if}
      <span>状态：{dashboardStore.statusLabel}</span>
    </Badge>

    {#if dashboardStore.runState !== "idle"}
      <Badge
        variant="outline"
        class="gap-2 rounded-xl border-border/50 px-3 py-1.5 text-xs"
      >
        <IconClock size={14} stroke={1.5} class="text-muted-foreground" />
        <span class="font-mono">{fmtTime(dashboardStore.elapsedSeconds)}</span>
      </Badge>
    {/if}
  </div>
</header>
