<!-- NovelToVideoDashboard/RunLogPanel.svelte -->
<!-- 职责：运行 / 终止态下的滚动日志面板。完全只读 store。 -->
<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";
  import { Badge } from "$lib/components/ui/badge";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Separator } from "$lib/components/ui/separator";
  import {
    IconDatabase,
    IconClock,
    IconCircleCheckFilled,
    IconAlertTriangle,
    IconCircleDashed,
    IconLoader2,
  } from "@tabler/icons-svelte";
  import { dashboardStore } from "./dashboard.svelte";

  function nowStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
</script>

<div
  class="flex h-full min-h-112 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm animate-fade-in"
>
  <div
    class="flex items-center justify-between border-b border-border/50 px-6 py-4"
  >
    <div class="flex items-center gap-3">
      <div class="flex size-9 items-center justify-center rounded-xl bg-muted">
        <IconDatabase size={18} stroke={1.5} class="text-primary" />
      </div>
      <div>
        <h3 class="text-lg font-medium leading-tight">运行日志</h3>
        <p class="text-xs text-muted-foreground">实时输出 · 全部结果自动缓存</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Badge
        variant="outline"
        class="rounded-lg border-border/50 px-2 py-0.5 text-[10px]"
      >
        {dashboardStore.logs.length} 条
      </Badge>
      <Separator orientation="vertical" class="h-5" />
      <Badge
        variant="outline"
        class="gap-1.5 rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-mono"
      >
        <IconClock size={12} stroke={1.5} />
        {fmtTime(dashboardStore.elapsedSeconds)}
      </Badge>
    </div>
  </div>

  <ScrollArea class="flex-1">
    <ul use:autoAnimate class="flex flex-col gap-1 p-4">
      {#each dashboardStore.logs as log (log.id)}
        <li
          class="flex items-start gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 hover:bg-muted/60"
        >
          <span class="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
            {log.time}
          </span>

          <span class="mt-0.5 shrink-0">
            {#if log.level === "success"}
              <IconCircleCheckFilled
                size={14}
                stroke={1.5}
                class="text-emerald-500"
              />
            {:else if log.level === "warn"}
              <IconAlertTriangle
                size={14}
                stroke={1.5}
                class="text-amber-500"
              />
            {:else if log.level === "error"}
              <IconAlertTriangle
                size={14}
                stroke={1.5}
                class="text-destructive"
              />
            {:else}
              <IconCircleDashed
                size={14}
                stroke={1.5}
                class="text-muted-foreground"
              />
            {/if}
          </span>

          <span
            class={[
              "flex-1 leading-relaxed",
              log.level === "warn" && "text-amber-700 dark:text-amber-500",
              log.level === "error" && "text-destructive",
              log.level === "success" && "text-foreground",
              log.level === "info" && "text-foreground",
            ]}
          >
            {log.message}
          </span>
        </li>
      {/each}

      {#if dashboardStore.runState === "running"}
        <li
          class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground"
        >
          <span class="font-mono text-xs">{nowStr()}</span>
          <IconLoader2
            size={14}
            stroke={1.5}
            class="animate-spin text-primary"
          />
          <span>等待下一节点输出 …</span>
        </li>
      {/if}
    </ul>
  </ScrollArea>
</div>
