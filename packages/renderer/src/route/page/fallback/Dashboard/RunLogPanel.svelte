<!-- NovelToVideoDashboard/RunLogPanel.svelte -->
<!-- 职责：运行 / 终止态下的滚动日志面板。完全只读 store。 -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import { dashboardStore } from "$lib/store/dashboard.svelte";
  import { i18nStore } from "$lib/store/i18n.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconCircleDotted,
    IconClock,
    IconDatabase,
    IconLock,
    IconLockOpen,
    IconTrash,
  } from "@tabler/icons-svelte";

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
</script>

<div
  class="flex h-full min-h-112 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm animate-fade-in"
>
  <!-- 主控区域 -->
  <div class="border-b border-border/50 bg-muted/30 px-6 py-4">
    <div class="flex items-start justify-between gap-4">
      <!-- 左侧标题与状态 -->
      <div class="flex items-center gap-3">
        <div
          class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background border border-border/50"
        >
          <IconDatabase size={18} stroke={1.5} class="text-primary" />
        </div>
        <div>
          <h3 class="text-lg font-medium leading-tight">运行日志</h3>
          <p class="text-xs text-muted-foreground">
            实时输出 · 全部结果自动缓存
          </p>
        </div>
      </div>

      <!-- 右侧控制栏 -->
      <div class="flex shrink-0 items-center gap-3">
        <!-- 运行时长 -->
        {#if dashboardStore.runState !== "idle"}
          <Badge
            variant="outline"
            class="gap-1.5 rounded-lg border-border/50 px-2.5 py-1 text-xs font-mono tabular-nums"
          >
            <IconClock size={12} stroke={1.5} />
            {fmtTime(dashboardStore.elapsedSeconds)}
          </Badge>

          <Separator orientation="vertical" class="h-5" />
        {/if}

        <!-- 日志计数 -->
        <Badge
          variant="outline"
          class="rounded-lg border-border/50 px-2.5 py-1 text-xs tabular-nums"
        >
          <IconCircleDotted size={12} stroke={1.5} class="mr-1.5" />
          {dashboardStore.logs.length} 条
        </Badge>

        <Separator orientation="vertical" class="h-5" />

        <!-- 保留日志开关 -->
        <div class="flex items-center gap-2">
          <Switch
            checked={dashboardStore.preserveLogs}
            onCheckedChange={dashboardStore.togglePreserveLogs}
            class="scale-75"
          />
          <button
            onclick={dashboardStore.togglePreserveLogs}
            class="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            {#if dashboardStore.preserveLogs}
              <IconLock size={12} stroke={1.5} />
              <span>保留日志</span>
            {:else}
              <IconLockOpen size={12} stroke={1.5} />
              <span>重启清除</span>
            {/if}
          </button>
        </div>

        <Separator orientation="vertical" class="h-5" />

        <!-- 清除按钮 -->
        <Button
          variant="ghost"
          size="sm"
          onclick={dashboardStore.clearLogs}
          disabled={dashboardStore.logs.length === 0}
          class="h-8 gap-1.5 rounded-xl px-3 text-xs"
        >
          <IconTrash size={14} stroke={1.5} />
          清除
        </Button>
      </div>
    </div>
  </div>

  <!-- 日志滚动区域 -->
  <ScrollArea class="flex-1">
    <ul use:autoAnimate class="flex flex-col p-4">
      {#if dashboardStore.logs.length === 0}
        <li
          class="flex flex-col items-center justify-center gap-2 py-12 text-center"
        >
          <IconCircleDotted
            size={32}
            stroke={1.5}
            class="text-muted-foreground/40"
          />
          <p class="text-sm text-muted-foreground">暂无日志输出</p>
        </li>
      {:else}
        {#each dashboardStore.logs as log (log.id)}
          <li
            class="group flex items-start gap-3 rounded-xl px-4 py-2.5 text-sm transition-all duration-200 hover:bg-muted/50"
          >
            <!-- 时间戳 -->
            <span
              class="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums opacity-60 transition-opacity duration-200 group-hover:opacity-100"
            >
              {i18nStore.dayjs(log.time).fromNow()}
            </span>

            <!-- 消息内容 -->
            <span class="flex-1 leading-relaxed text-foreground">
              {log.message}
            </span>
          </li>
        {/each}
      {/if}
    </ul>
  </ScrollArea>
</div>
