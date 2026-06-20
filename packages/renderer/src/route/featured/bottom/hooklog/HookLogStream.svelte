<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Button } from "$lib/components/ui/button";
  import { IconSearch } from "@tabler/icons-svelte";
  import type { LogLevelMeta } from "./types";
  import type { LogLevel, LogMessage } from "electron-log";
  import autoAnimate from "@formkit/auto-animate";
  import { hookLogStore } from "./hook-log.store.svelte";
  import { i18nStore } from "$lib/store/i18n.svelte";

  let {
    filtered = [],
    levelMeta = {} as Record<LogLevel, LogLevelMeta>,
    formatData,
  }: {
    filtered?: LogMessage[];
    levelMeta?: Record<LogLevel, LogLevelMeta>;
    formatData: (data: unknown[]) => string;
  } = $props();

  /**
   * 格式化日期为 HH:mm:ss.SSS
   */
  function formatTime(date: Date | string | undefined): string {
    if (!date) return "";
    return i18nStore.dayjs(date).format("HH:mm:ss.SSS");
  }

  /**
   * 为每条日志生成一个稳定的 key
   * LogMessage 本身没有 id，使用 date + logId + 索引组合保证稳定
   */
  function entryKey(entry: LogMessage, index: number): string {
    const t =
      entry.date instanceof Date
        ? entry.date.getTime()
        : new Date(entry.date ?? 0).getTime();
    return `${t}-${entry.logId ?? "_"}-${entry.level}-${index}`;
  }
</script>

<div class="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs">
  {#if !hookLogStore.connected}
    <div class="space-y-1.5">
      {#each Array.from({ length: 12 }, (_, idx) => idx) as index (index)}
        <div class="flex items-center gap-2.5">
          <Skeleton class="h-3.5 w-1 rounded-lg" />
          <Skeleton class="h-3.5 w-24 rounded-lg" />
          <Skeleton class="h-3.5 w-16 rounded-lg" />
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
      {#if hookLogStore.search.length > 0 || hookLogStore.activeLevels.size !== 6}
        <Button
          variant="outline"
          size="sm"
          class="mt-2 rounded-xl"
          onclick={() => hookLogStore.resetFilters()}
        >
          重置过滤器
        </Button>
      {/if}
    </div>
  {:else}
    <div class="space-y-0.5" use:autoAnimate>
      {#each filtered as entry, index (entryKey(entry, index))}
        {@const meta = levelMeta[entry.level]}
        <div
          class="hover:bg-muted/50 animate-fade-in group flex items-stretch gap-2.5 rounded-xl px-2 py-1.5 transition-all duration-200"
        >
          <!-- 级别色条：替代原级别前缀，作为视觉锚点 -->
          <div
            class={["w-0.5 shrink-0 self-stretch rounded-full", meta?.bar]}
            aria-label={entry.level}
          ></div>

          <!-- 时间戳：跟随级别色，降低不透明度作为次级信息 -->
          <div
            class={["mt-0.5 w-24 shrink-0 tabular-nums opacity-60", meta?.tone]}
          >
            {formatTime(entry.date)}
          </div>

          <!-- Scope 标签：使用与筛选按钮一致的 chip 风格 -->
          {#if entry.scope}
            <div
              class={[
                "mt-0.5 shrink-0 self-start rounded-lg border px-1.5 py-0.5 text-xs font-medium",
                meta?.chip,
              ]}
            >
              {entry.scope}
            </div>
          {/if}

          <!-- 消息正文：使用级别 tone 完整着色，模拟 electron-log 控制台输出 -->
          <div
            class={[
              "mt-0.5 min-w-0 flex-1 wrap-break-word whitespace-pre-wrap",
              meta?.tone,
            ]}
          >
            {formatData(entry.data)}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
