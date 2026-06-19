<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { Switch } from "$lib/components/ui/switch";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Select from "$lib/components/ui/select";
  //   import { dialogStore } from "$lib/stores/dialog.svelte";
  //   import ConfirmDialog from "$lib/components/dialogs/ConfirmDialog.svelte";
  import {
    IconTerminal2,
    IconSearch,
    IconTrash,
    IconPlayerPause,
    IconPlayerPlay,
    IconArrowDown,
    IconAlertTriangle,
    IconInfoCircle,
    IconBug,
    IconActivity,
    IconCircleFilled,
    IconDownload,
    IconX,
    IconFilter,
    IconBolt,
    IconWifi,
    IconWifiOff,
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
    // 真实接入：const stream = rpc().system.hooklog();
    const stream = mockHookLog();
    connected = true;
    try {
      for await (const entry of stream) {
        if (cancelled) break;
        if (paused) continue;
        logs.push(entry);
        if (logs.length > maxBuffer) {
          logs = logs.slice(-maxBuffer);
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
        viewport.scrollTop = viewport.scrollHeight;
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
    logs = seed;
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
    if (next.size === 0) next.add(level); // 至少保留一个
    activeLevels = next;
  }

  async function clearLogs() {
    // const ok = await dialogStore.safeShow(ConfirmDialog, {
    //   title: "清空日志缓存？",
    //   message: `将永久清除当前 ${logs.length} 条本地缓存日志，此操作不可撤销。`,
    // });
    // if (!ok) return;
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
    const atBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
      threshold;
    if (!atBottom && autoScroll) autoScroll = false;
  }

  function jumpToBottom() {
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
  class="bg-background text-foreground flex h-full min-h-screen w-full flex-col rounded-3xl p-8 lg:p-12"
>
  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → HookLogHeader.svelte]                │ -->
  <!-- │ 职责：顶部品牌区 + 连接状态 + 全局动作按钮            │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <header
    class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
  >
    <div class="flex items-center gap-4">
      <div
        class="bg-primary/10 text-primary border-border/50 flex size-12 items-center justify-center rounded-2xl border"
      >
        <IconTerminal2 size={24} stroke={1.5} />
      </div>
      <div class="space-y-1">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">
            {title}
          </h1>
          <span
            class="border-border/50 bg-muted/50 inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs"
          >
            {#if connected}
              <IconCircleFilled
                size={8}
                class="animate-pulse text-emerald-500"
              />
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
        <p class="text-muted-foreground text-xs">
          实时订阅 <code class="bg-muted rounded-md px-1.5 py-0.5"
            >rpc().system.hooklog()</code
          >
          · 缓冲上限
          {maxBuffer} 条
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Tooltip.Provider delayDuration={150}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="sm"
                class="rounded-xl"
                onclick={() => (paused = !paused)}
              >
                {#if paused}
                  <IconPlayerPlay size={16} stroke={1.5} />
                  <span class="ml-1.5">继续</span>
                {:else}
                  <IconPlayerPause size={16} stroke={1.5} />
                  <span class="ml-1.5">暂停</span>
                {/if}
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content
            >暂停后不再接收新日志（已接收的会丢弃）</Tooltip.Content
          >
        </Tooltip.Root>

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="outline"
                size="sm"
                class="rounded-xl"
                onclick={exportLogs}
              >
                <IconDownload size={16} stroke={1.5} />
                <span class="ml-1.5">导出</span>
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>导出当前筛选结果为 JSON</Tooltip.Content>
        </Tooltip.Root>

        <Button
          variant="destructive"
          size="sm"
          class="rounded-xl"
          onclick={clearLogs}
          disabled={logs.length === 0}
        >
          <IconTrash size={16} stroke={1.5} />
          <span class="ml-1.5">清空</span>
        </Button>
      </Tooltip.Provider>
    </div>
  </header>
  <!-- ╭─── / HookLogHeader ───╮ -->

  <Separator class="my-8" />

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → HookLogStats.svelte]                 │ -->
  <!-- │ 职责：四级日志数量 Bento 卡片                         │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <section class="grid grid-cols-2 gap-6 lg:grid-cols-4">
    {#each ["debug", "info", "warn", "error"] as lv (lv)}
      {@const meta = LEVEL_META[lv as LogLevel]}
      {@const Icon = meta.icon}
      {@const count = stats[lv as LogLevel]}
      {@const isActive = activeLevels.has(lv as LogLevel)}
      <button
        type="button"
        class={[
          "group border-border/50 bg-card relative overflow-hidden rounded-2xl border p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
          !isActive && "opacity-50 hover:opacity-80",
        ]}
        onclick={() => toggleLevel(lv as LogLevel)}
      >
        <div class={["absolute inset-x-0 top-0 h-1", meta.bar]}></div>
        <div class="flex items-start justify-between">
          <div
            class={[
              "flex size-10 items-center justify-center rounded-xl border",
              meta.chip,
            ]}
          >
            <Icon size={20} stroke={1.5} />
          </div>
          {#if isActive}
            <Badge variant="secondary" class="rounded-lg text-xs">显示</Badge>
          {:else}
            <Badge variant="outline" class="rounded-lg text-xs">隐藏</Badge>
          {/if}
        </div>
        <div class="mt-6 space-y-1">
          <div
            class={[
              "text-3xl font-semibold tracking-tight tabular-nums",
              meta.tone,
            ]}
          >
            {count}
          </div>
          <div class="text-muted-foreground text-xs uppercase tracking-wide">
            {meta.label} entries
          </div>
        </div>
      </button>
    {/each}
  </section>
  <!-- ╭─── / HookLogStats ───╮ -->

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → HookLogToolbar.svelte]               │ -->
  <!-- │ 职责：搜索 + 组件过滤 + 自动滚动开关                  │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <section
    class="border-border/50 bg-card mt-8 flex flex-col gap-4 rounded-2xl border p-6 shadow-sm lg:flex-row lg:items-center"
  >
    <div class="relative flex-1">
      <IconSearch
        size={18}
        stroke={1.5}
        class="text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2"
      />
      <Input
        bind:value={search}
        placeholder="搜索消息 / 组件 / 时间..."
        class="rounded-xl pl-10 pr-10"
      />
      {#if search}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-200"
          onclick={() => (search = "")}
          aria-label="清除搜索"
        >
          <IconX size={16} stroke={1.5} />
        </button>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <IconFilter size={16} stroke={1.5} class="text-muted-foreground" />
      <Select.Root type="single" bind:value={activeComponent}>
        <Select.Trigger class="w-[200px] rounded-xl">
          {activeComponent === "__all__" ? "全部组件" : activeComponent}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="__all__">全部组件</Select.Item>
          {#each knownComponents as c (c)}
            <Select.Item value={c}>{c}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <Separator orientation="vertical" class="hidden h-8 lg:block" />

    <div class="flex items-center gap-3">
      <span class="text-muted-foreground text-xs">自动滚动</span>
      <Switch bind:checked={autoScroll} />
    </div>
  </section>
  <!-- ╭─── / HookLogToolbar ───╮ -->

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → HookLogStream.svelte]                │ -->
  <!-- │ 职责：日志流主体视区 + 行渲染 + 空态 + 骨架           │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <section
    class="border-border/50 bg-card relative mt-8 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm"
  >
    <div
      class="border-border/50 bg-muted/30 flex items-center justify-between border-b px-6 py-3"
    >
      <div class="flex items-center gap-2">
        <IconActivity size={16} stroke={1.5} class="text-muted-foreground" />
        <span class="text-sm font-medium">实时流</span>
        <Badge
          variant="secondary"
          class="rounded-lg font-mono text-xs tabular-nums"
        >
          {filtered.length} / {logs.length}
        </Badge>
      </div>
      <div
        class="text-muted-foreground flex items-center gap-2 font-mono text-xs"
      >
        {#if connected}
          <IconWifi size={14} stroke={1.5} class="text-emerald-500" />
          <span>connected</span>
        {:else}
          <IconWifiOff size={14} stroke={1.5} />
          <span>disconnected</span>
        {/if}
      </div>
    </div>

    <div
      bind:this={viewport}
      onscroll={onScroll}
      class="min-h-105 flex-1 overflow-y-auto px-2 py-2 font-mono text-sm"
    >
      {#if loading}
        <div class="space-y-2 p-4">
          {#each Array.from({ length: 8 }, (_, idx) => idx) as index (index)}
            <div class="flex items-center gap-3">
              <Skeleton class="h-4 w-16 rounded-lg" />
              <Skeleton class="h-4 w-24 rounded-lg" />
              <Skeleton class="h-4 w-32 rounded-lg" />
              <Skeleton class="h-4 flex-1 rounded-lg" />
            </div>
          {/each}
        </div>
      {:else if filtered.length === 0}
        <div
          class="animate-fade-in flex h-full min-h-100 flex-col items-center justify-center gap-3 px-8 py-16 text-center"
        >
          <div
            class="bg-muted/50 border-border/50 flex size-14 items-center justify-center rounded-2xl border"
          >
            <IconSearch size={24} stroke={1.5} class="text-muted-foreground" />
          </div>
          <div class="space-y-1">
            <p class="text-lg font-medium">没有匹配的日志</p>
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
              class="hover:bg-muted/50 group flex items-start gap-3 rounded-xl px-4 py-2.5 transition-all duration-200"
            >
              <div class={["mt-0.5 w-12 shrink-0 tabular-nums", meta.tone]}>
                {entry.level}
              </div>
              <div class="text-muted-foreground w-24 shrink-0 tabular-nums">
                {entry.time}
              </div>
              {#if entry.component}
                <div
                  class="bg-primary/10 text-primary shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium"
                >
                  {entry.component}
                </div>
              {:else}
                <div class="w-20 shrink-0"></div>
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
        class="animate-fade-in bg-primary text-primary-foreground hover:bg-primary/90 absolute bottom-6 right-6 flex items-center gap-2 rounded-xl px-4 py-2 text-sm shadow-xl transition-all duration-200 hover:-translate-y-0.5"
        onclick={jumpToBottom}
      >
        <IconArrowDown size={16} stroke={1.5} />
        <span>回到底部</span>
      </button>
    {/if}
  </section>
  <!-- ╭─── / HookLogStream ───╮ -->

  <footer
    class="text-muted-foreground mt-8 flex items-center justify-between text-xs"
  >
    <p>实时日志流 · 本地缓冲 {logs.length} 条 · 显示 {filtered.length} 条</p>
    <p class="font-mono">
      {#if connected}
        streaming <span class="text-emerald-500">●</span>
      {:else if paused}
        paused <span class="text-amber-500">●</span>
      {:else}
        offline <span class="text-muted-foreground/50">●</span>
      {/if}
    </p>
  </footer>
</div>

<style>
  /* 确保滚动区域在全屏布局下正确撑开 */
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
</style>
