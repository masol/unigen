<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Button } from "$lib/components/ui/button";
  import { IconSearch } from "@tabler/icons-svelte";
  import type { LogEntry, LogLevel, LogLevelMeta } from "./types";
  import autoAnimate from "@formkit/auto-animate";

  let {
    filtered = [],
    loading = false,
    search = "",
    activeComponent = "__all__",
    levelMeta = {} as Record<LogLevel, LogLevelMeta>,
    onResetFilters = () => {},
  }: {
    filtered?: LogEntry[];
    loading?: boolean;
    search?: string;
    activeComponent?: string;
    levelMeta?: Record<LogLevel, LogLevelMeta>;
    onResetFilters?: () => void;
  } = $props();
</script>

<div class="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs">
  {#if loading}
    <div class="space-y-1.5">
      {#each Array.from({ length: 12 }, (_, idx) => idx) as index (index)}
        <div class="flex items-center gap-2.5">
          <Skeleton class="h-3.5 w-12 rounded-lg" />
          <Skeleton class="h-3.5 w-20 rounded-lg" />
          <Skeleton class="h-3.5 w-24 rounded-lg" />
          <Skeleton class="h-3.5 flex-1 rounded-lg" />
        </div>
      {/each}
    </div>
  {:else if filtered.length === 0}
    <div
      class="animate-fade-in flex h-full min-h-60 flex-col items-center justify-center gap-2.5 px-8 py-12 text-center"
    >
      <div
        class="bg-muted/50 border-border/50 flex size-12 items-center justify-center rounded-2xl border"
      >
        <IconSearch size={20} stroke={1.5} class="text-muted-foreground" />
      </div>
      <div class="space-y-1">
        <p class="text-sm font-medium">没有匹配的日志</p>
        <p class="text-muted-foreground text-xs">
          尝试调整搜索关键词或重新启用某些级别 / 组件过滤
        </p>
      </div>
      {#if search || activeComponent !== "__all__"}
        <Button
          variant="outline"
          size="sm"
          class="mt-2 rounded-xl"
          onclick={onResetFilters}
        >
          重置过滤器
        </Button>
      {/if}
    </div>
  {:else}
    <div class="space-y-0.5" use:autoAnimate>
      {#each filtered as entry (entry.id)}
        {@const meta = levelMeta[entry.level]}
        <!-- 添加 animate-fade-in 实现淡入效果 -->
        <div
          class="hover:bg-muted/50 animate-fade-in group flex items-start gap-2.5 rounded-xl px-3 py-1.5 transition-all duration-200"
        >
          <div class={["mt-0.5 w-11 shrink-0 tabular-nums", meta.tone]}>
            {entry.level}
          </div>
          <div class="text-muted-foreground w-20 shrink-0 tabular-nums">
            {entry.time}
          </div>
          {#if entry.component}
            <div
              class="bg-primary/10 text-primary shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-medium"
            >
              {entry.component}
            </div>
          {:else}
            <div class="w-16 shrink-0"></div>
          {/if}
          <div class="text-foreground min-w-0 flex-1 wrap-break-word">
            {entry.message}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
