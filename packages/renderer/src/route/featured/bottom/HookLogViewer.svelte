<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Switch } from "$lib/components/ui/switch";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Select from "$lib/components/ui/select";
  import {
    IconTerminal2,
    IconSearch,
    IconTrash,
    IconPlayerPause,
    IconPlayerPlay,
    IconArrowUp,
    IconAlertTriangle,
    IconInfoCircle,
    IconBug,
    IconCircleFilled,
    IconDownload,
    IconX,
    IconBolt,
  } from "@tabler/icons-svelte";

  // ───────────────────────────── Types ─────────────────────────────
  type LogLevel = "debug" | "info" | "warn" | "error";
  type LogEntry = {
    id: string;
    level: LogLevel;
    time: string;
    component: string | null;
    message: string;
  };

  type Props = {
    maxBuffer?: number;
    title?: string;
  };

  let { maxBuffer = 800, title = "System Hook Logs" }: Props = $props();

  // ─────────────────────────── State ───────────────────────────────
  let logs = $state<LogEntry[]>([]);
  let search = $state("");
  let activeLevels = $state<Set<LogLevel>>(
    new Set(["debug", "info", "warn", "error"]),
  );
  let activeComponent = $state<string>("__all__");
  let paused = $state(false);
  let autoScroll = $state(true);
  let loading = $state(true);
  let connected = $state(false);
  let viewport = $state<HTMLDivElement | null>(null);

  // ─────────────────────── Mock RPC stream ─────────────────────────
  const MOCK_COMPONENTS: (string | null)[] = [
    "LayoutStore",
    "AppLoader",
    "RpcClient",
    "AuthService",
    "FileExplorer",
    "TerminalView",
    "NotificationHub",
    "WindowManager",
    null,
    "SocketBridge",
    "ThemeEngine",
    "PluginHost",
  ];
  const MOCK_MESSAGES: Record<LogLevel, string[]> = {
    info: [
      "activity registered, id=file-explorer, total=1",
      "connection established to ws://localhost:9000",
      "user session restored from cache (uid=42)",
      "plugin loaded: media-preview v2.3.1",
      "workspace synced successfully (124 files)",
      'theme switched to "Graphite Dark"',
      "hook registered: onWindowFocus → LayoutStore.refresh",
    ],
    debug: [
      "state transition: idle → loading",
      "cache hit: /api/system/config (12ms)",
      "event dispatched: layout.resize { w: 1280, h: 720 }",
      "rendering 47 items in viewport",
      "rpc frame size=2.4kb, channel=system",
      "reactive deps recomputed in 0.8ms",
    ],
    warn: [
      "slow query detected: 1245ms on /system/manifest",
      "deprecated API usage: legacy.openWindow()",
      "reconnection attempt 2/5 in 3s",
      "frame budget exceeded: 22ms (target 16ms)",
    ],
    error: [
      "failed to fetch manifest: NetworkError",
      "unhandled rejection in worker thread #3",
      "permission denied: /sys/devices/cpu",
      "rpc timeout: system.hooklog after 5000ms",
    ],
  };

  function pad(n: number, w = 2) {
    return String(n).padStart(w, "0");
  }
  function nowTime() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }
  function randomLog(): LogEntry {
    const weights: LogLevel[] = [
      "info",
      "info",
      "info",
      "info",
      "debug",
      "debug",
      "warn",
      "error",
    ];
    const level = weights[Math.floor(Math.random() * weights.length)];
    const component =
      MOCK_COMPONENTS[Math.floor(Math.random() * MOCK_COMPONENTS.length)];
    const pool = MOCK_MESSAGES[level];
    const message = pool[Math.floor(Math.random() * pool.length)];
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      level,
      time: nowTime(),
      component,
      message,
    };
  }

  async function* mockHookLog(): AsyncGenerator<LogEntry> {
    while (true) {
      await new Promise((r) => setTimeout(r, 220 + Math.random() * 1100));
      yield randomLog();
    }
  }

  let cancelled = false;
  async function consumeStream() {
    const stream = mockHookLog();
    connected = true;
    try {
      for await (const entry of stream) {
        if (cancelled) break;
        if (paused) continue;
        logs.unshift(entry); // 最新的放在前面
        if (logs.length > maxBuffer) {
          logs = logs.slice(0, maxBuffer);
        }
        if (autoScroll) scheduleScroll();
      }
    } finally {
      connected = false;
    }
  }

  let scrollPending = false;
  function scheduleScroll() {
    if (scrollPending) return;
    scrollPending = true;
    tick().then(() => {
      scrollPending = false;
      if (autoScroll && viewport) {
        viewport.scrollTop = 0; // 滚动到顶部（最新的）
      }
    });
  }

  onMount(() => {
    // seed 历史
    const seed: LogEntry[] = [];
    const baseTime = Date.now() - 60 * 1000;
    for (let i = 0; i < 24; i++) {
      const e = randomLog();
      const d = new Date(baseTime + i * 1800);
      e.time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
      seed.push(e);
    }
    logs = seed.reverse(); // 最新的在前
    setTimeout(() => {
      loading = false;
      scheduleScroll();
      consumeStream();
    }, 650);
  });

  onDestroy(() => {
    cancelled = true;
  });

  // ─────────────────────── Derived data ────────────────────────────
  const knownComponents = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const set = new Set<string>();
    for (const l of logs) if (l.component) set.add(l.component);
    return Array.from(set).sort();
  });

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (!activeLevels.has(l.level)) return false;
      if (activeComponent !== "__all__" && l.component !== activeComponent)
        return false;
      if (q) {
        const hay =
          `${l.message} ${l.component ?? ""} ${l.level} ${l.time}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  const stats = $derived.by(() => {
    const s = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const l of logs) s[l.level]++;
    return s;
  });

  // ─────────────────────── Actions ─────────────────────────────────
  function toggleLevel(level: LogLevel) {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(activeLevels);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    if (next.size === 0) next.add(level);
    activeLevels = next;
  }

  async function clearLogs() {
    logs = [];
  }

  function exportLogs() {
    const payload = filtered.map((l) => ({
      level: l.level,
      time: l.time,
      component: l.component,
      message: l.message,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hooklog-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onScroll() {
    if (!viewport) return;
    const threshold = 40;
    const atTop = viewport.scrollTop < threshold;
    if (!atTop && autoScroll) autoScroll = false;
  }

  function jumpToTop() {
    autoScroll = true;
    scheduleScroll();
  }

  // ─────────────────────── Styling helpers ─────────────────────────
  const LEVEL_META: Record<
    LogLevel,
    {
      label: string;
      tone: string;
      bar: string;
      chip: string;
      icon: typeof IconInfoCircle;
    }
  > = {
    debug: {
      label: "debug",
      tone: "text-muted-foreground",
      bar: "bg-muted-foreground/50",
      chip: "bg-muted text-muted-foreground border-border/60",
      icon: IconBug,
    },
    info: {
      label: "info",
      tone: "text-sky-500",
      bar: "bg-sky-500",
      chip: "bg-sky-500/10 text-sky-500 border-sky-500/30",
      icon: IconInfoCircle,
    },
    warn: {
      label: "warn",
      tone: "text-amber-500",
      bar: "bg-amber-500",
      chip: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      icon: IconAlertTriangle,
    },
    error: {
      label: "error",
      tone: "text-red-500",
      bar: "bg-red-500",
      chip: "bg-red-500/10 text-red-500 border-red-500/30",
      icon: IconBolt,
    },
  };
</script>

<div
  class="bg-background text-foreground flex h-full w-full flex-col rounded-3xl"
>
  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → HookLogHeader.svelte]                │ -->
  <!-- │ 职责：顶部紧凑工具栏 + 过滤 + 动作按钮                │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
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

    <!-- 级别过滤按钮组 -->
    <div class="flex items-center gap-1.5">
      {#each ["debug", "info", "warn", "error"] as lv (lv)}
        {@const meta = LEVEL_META[lv as LogLevel]}
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

    <!-- 右侧工具栏 -->
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
        <Select.Trigger class="h-8 w-[140px] rounded-xl text-xs">
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
                onclick={() => (paused = !paused)}
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
                onclick={exportLogs}
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
          onclick={clearLogs}
          disabled={logs.length === 0}
        >
          <IconTrash size={16} stroke={1.5} />
        </Button>
      </Tooltip.Provider>
    </div>
  </header>
  <!-- ╭─── / HookLogHeader ───╮ -->

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → HookLogStream.svelte]                │ -->
  <!-- │ 职责：日志流主体视区 + 行渲染 + 空态 + 骨架           │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <div
      bind:this={viewport}
      onscroll={onScroll}
      class="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs"
    >
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
              onclick={() => {
                search = "";
                activeComponent = "__all__";
              }}
            >
              重置过滤器
            </Button>
          {/if}
        </div>
      {:else}
        <ul use:autoAnimate={{ duration: 180 }}>
          {#each filtered as entry (entry.id)}
            {@const meta = LEVEL_META[entry.level]}
            <li
              class="hover:bg-muted/50 group flex items-start gap-2.5 rounded-xl px-3 py-1.5 transition-all duration-200"
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
              <div class="text-foreground min-w-0 flex-1 break-words">
                {entry.message}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if !autoScroll && filtered.length > 0}
      <button
        type="button"
        class="animate-fade-in bg-primary text-primary-foreground hover:bg-primary/90 absolute right-4 top-4 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs shadow-xl transition-all duration-200 hover:-translate-y-0.5"
        onclick={jumpToTop}
      >
        <IconArrowUp size={14} stroke={1.5} />
        <span>回到顶部</span>
      </button>
    {/if}

    <div
      class="border-border/50 text-muted-foreground flex shrink-0 items-center justify-between border-t bg-background px-4 py-2 text-xs"
    >
      <div class="flex items-center gap-3">
        <span class="font-mono">
          显示 <span class="text-foreground font-medium">{filtered.length}</span
          >
          / <span class="text-foreground font-medium">{logs.length}</span>
        </span>
        <Separator orientation="vertical" class="h-3.5" />
        <span>缓冲上限 {maxBuffer} 条</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs">自动滚动</span>
        <Switch bind:checked={autoScroll} />
      </div>
    </div>
  </div>
</div>
