<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import * as Tooltip from "$lib/components/ui/tooltip";
  // import * as Select from "$lib/components/ui/select";
  import {
    IconAlertTriangle,
    IconSearch,
    IconTrash,
    IconPlayerPause,
    IconPlayerPlay,
    IconX,
    IconCircleFilled,
    IconFolder,
  } from "@tabler/icons-svelte";
  import type { LogLevelMeta } from "./types";
  import { hookLogStore } from "./hook-log.store.svelte";
  import { api } from "$lib/utils/api";
  import type { LogLevel } from "electron-log";

  let {
    title = "Logs",
    stats = { debug: 0, info: 0, warn: 0, error: 0, verbose: 0, silly: 0 },
    levelMeta = {} as Record<LogLevel, LogLevelMeta>,
  }: {
    title?: string;
    stats?: Record<LogLevel, number>;
    levelMeta?: Record<LogLevel, LogLevelMeta>;
  } = $props();

  function toggleLevel(level: LogLevel) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(hookLogStore.activeLevels);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    if (next.size === 0) next.add(level);
    hookLogStore.activeLevels = next;
  }

  async function showInExplorer() {
    const logFilepath = await api().system.getPath({ name: "logs" });
    await api().system.showItemInFolder({
      path: logFilepath,
    });
  }
</script>

<header
  class="border-border/50 bg-card flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-3"
>
  <div class="flex items-center gap-2">
    <div
      class="bg-primary/10 text-primary border-border/50 flex size-8 items-center justify-center rounded-xl border"
    >
      <IconAlertTriangle size={18} stroke={1.5} />
    </div>
    <span class="text-sm font-medium">{title}</span>
    <span
      class="border-border/50 bg-muted/50 inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs"
    >
      {#if hookLogStore.connected}
        <IconCircleFilled size={8} class="animate-pulse text-emerald-500" />
        <span class="text-muted-foreground">streaming</span>
      {:else if hookLogStore.paused}
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
    {#each ["silly", "debug", "info", "verbose", "warn", "error"] as lv (lv)}
      {@const meta = levelMeta[lv as LogLevel]}
      {@const Icon = meta.icon}
      {@const count = stats[lv as LogLevel]}
      {@const isActive = hookLogStore.activeLevels.has(lv as LogLevel)}
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
        bind:value={hookLogStore.search}
        placeholder="搜索..."
        class="h-8 rounded-xl pl-8 pr-8 text-xs"
      />
      {#if hookLogStore.search}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 transition-all duration-200"
          onclick={() => (hookLogStore.search = "")}
          aria-label="清除搜索"
        >
          <IconX size={14} stroke={1.5} />
        </button>
      {/if}
    </div>

    <!-- <Select.Root type="single" bind:value={hookLogStore.activeScope}>
      <Select.Trigger class="h-8 w-35 rounded-xl text-xs">
        {hookLogStore.activeScope === "__all__"
          ? "全部组件"
          : hookLogStore.activeScope}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="__all__">全部组件</Select.Item>
        {#each hookLogStore.knownComponents as c (c)}
          <Select.Item value={c}>{c}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root> -->

    <Separator orientation="vertical" class="h-6" />

    <!-- Keepalive 开关 -->
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <div
              {...props}
              class="border-border/50 bg-muted/30 flex h-8 items-center gap-2 rounded-xl border px-2.5"
            >
              <Label
                for="keepalive-switch"
                class="text-muted-foreground cursor-pointer text-xs font-medium"
              >
                常驻
              </Label>
              <Switch
                id="keepalive-switch"
                checked={hookLogStore.keepalive}
                onCheckedChange={(v) => (hookLogStore.keepalive = v)}
                class="scale-75"
              />
            </div>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {hookLogStore.keepalive
            ? "已开启：窗口关闭后保持连接"
            : "已关闭：窗口关闭后断开连接"}
        </Tooltip.Content>
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="sm"
              class="h-8 rounded-xl px-2"
              onclick={() => hookLogStore.togglePause()}
            >
              {#if hookLogStore.paused}
                <IconPlayerPlay size={16} stroke={1.5} />
              {:else}
                <IconPlayerPause size={16} stroke={1.5} />
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content
          >{hookLogStore.paused ? "继续接收" : "暂停接收"}</Tooltip.Content
        >
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="sm"
              class="h-8 rounded-xl px-2"
              onclick={showInExplorer}
            >
              <IconFolder size={16} stroke={1.5} />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>在资源管理器中打开日志</Tooltip.Content>
      </Tooltip.Root>

      <Button
        variant="ghost"
        size="sm"
        class="h-8 rounded-xl px-2"
        onclick={() => hookLogStore.clear()}
      >
        <IconTrash size={16} stroke={1.5} />
      </Button>
    </Tooltip.Provider>
  </div>
</header>
