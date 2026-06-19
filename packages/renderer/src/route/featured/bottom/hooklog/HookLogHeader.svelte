<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Select from "$lib/components/ui/select";
  import {
    IconTerminal2,
    IconSearch,
    IconTrash,
    IconPlayerPause,
    IconPlayerPlay,
    IconDownload,
    IconX,
    IconCircleFilled,
  } from "@tabler/icons-svelte";
  import type { LogLevel, LogLevelMeta } from "./types";

  let {
    title = "Logs",
    search = $bindable(""),
    activeLevels = $bindable<Set<LogLevel>>(new Set()),
    activeComponent = $bindable("__all__"),
    knownComponents = [],
    stats = { debug: 0, info: 0, warn: 0, error: 0 },
    levelMeta = {} as Record<LogLevel, LogLevelMeta>,
    connected = false,
    paused = false,
    onTogglePause = () => {},
    onClear = () => {},
    onExport = () => {},
  }: {
    title?: string;
    search?: string;
    activeLevels?: Set<LogLevel>;
    activeComponent?: string;
    knownComponents?: string[];
    stats?: Record<LogLevel, number>;
    levelMeta?: Record<LogLevel, LogLevelMeta>;
    connected?: boolean;
    paused?: boolean;
    onTogglePause?: () => void;
    onClear?: () => void;
    onExport?: () => void;
  } = $props();

  function toggleLevel(level: LogLevel) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(activeLevels);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    if (next.size === 0) next.add(level);
    activeLevels = next;
  }
</script>

<header
  class="border-border/50 bg-card flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3"
>
  <div class="flex items-center gap-2">
    <div
      class="bg-primary/10 text-primary border-border/50 flex size-8 items-center justify-center rounded-xl border"
    >
      <IconTerminal2 size={18} stroke={1.5} />
    </div>
    <span class="text-sm font-medium">{title}</span>
    <span
      class="border-border/50 bg-muted/50 inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs"
    >
      {#if connected}
        <IconCircleFilled size={8} class="animate-pulse text-emerald-500" />
        <span class="text-muted-foreground">streaming</span>
      {:else if paused}
        <IconCircleFilled size={8} class="text-amber-500" />
        <span class="text-muted-foreground">paused</span>
      {:else}
        <IconCircleFilled size={8} class="text-muted-foreground/50" />
        <span class="text-muted-foreground">offline</span>
      {/if}
    </span>
  </div>

  <Separator orientation="vertical" class="h-6" />

  <div class="flex items-center gap-1.5">
    {#each ["debug", "info", "warn", "error"] as lv (lv)}
      {@const meta = levelMeta[lv as LogLevel]}
      {@const Icon = meta.icon}
      {@const count = stats[lv as LogLevel]}
      {@const isActive = activeLevels.has(lv as LogLevel)}
      <Tooltip.Provider delayDuration={150}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class={[
                  "flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5",
                  isActive
                    ? meta.chip
                    : "border-border/50 bg-muted/30 text-muted-foreground opacity-50 hover:opacity-80",
                ]}
                onclick={() => toggleLevel(lv as LogLevel)}
              >
                <Icon size={14} stroke={1.5} />
                <span class="tabular-nums">{count}</span>
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content
            >{meta.label} · {isActive
              ? "点击隐藏"
              : "点击显示"}</Tooltip.Content
          >
        </Tooltip.Root>
      </Tooltip.Provider>
    {/each}
  </div>

  <div class="flex-1"></div>

  <div class="flex items-center gap-2">
    <div class="relative w-56">
      <IconSearch
        size={16}
        stroke={1.5}
        class="text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
      />
      <Input
        bind:value={search}
        placeholder="搜索..."
        class="h-8 rounded-xl pl-8 pr-8 text-xs"
      />
      {#if search}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 transition-all duration-200"
          onclick={() => (search = "")}
          aria-label="清除搜索"
        >
          <IconX size={14} stroke={1.5} />
        </button>
      {/if}
    </div>

    <Select.Root type="single" bind:value={activeComponent}>
      <Select.Trigger class="h-8 w-35 rounded-xl text-xs">
        {activeComponent === "__all__" ? "全部组件" : activeComponent}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="__all__">全部组件</Select.Item>
        {#each knownComponents as c (c)}
          <Select.Item value={c}>{c}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>

    <Separator orientation="vertical" class="h-6" />

    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="sm"
              class="h-8 rounded-xl px-2"
              onclick={onTogglePause}
            >
              {#if paused}
                <IconPlayerPlay size={16} stroke={1.5} />
              {:else}
                <IconPlayerPause size={16} stroke={1.5} />
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{paused ? "继续接收" : "暂停接收"}</Tooltip.Content>
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="sm"
              class="h-8 rounded-xl px-2"
              onclick={onExport}
            >
              <IconDownload size={16} stroke={1.5} />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>导出为 JSON</Tooltip.Content>
      </Tooltip.Root>

      <Button
        variant="ghost"
        size="sm"
        class="h-8 rounded-xl px-2"
        onclick={onClear}
      >
        <IconTrash size={16} stroke={1.5} />
      </Button>
    </Tooltip.Provider>
  </div>
</header>
