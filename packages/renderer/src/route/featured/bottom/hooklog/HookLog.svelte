<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    IconAlertTriangle,
    IconInfoCircle,
    IconBug,
    IconBolt,
  } from "@tabler/icons-svelte";
  import { hookLogStore } from "./hook-log.store.svelte";
  import HookLogHeader from "./HookLogHeader.svelte";
  import HookLogStream from "./HookLogStream.svelte";
  import HookLogFooter from "./HookLogFooter.svelte";
  import type { LogLevel, LogLevelMeta } from "./types";

  type Props = {
    maxBuffer?: number;
    title?: string;
  };

  let { maxBuffer = 800, title = "Logs" }: Props = $props();

  let search = $state("");
  let activeLevels = $state<Set<LogLevel>>(
    new Set(["debug", "info", "warn", "error"]),
  );
  let activeComponent = $state<string>("__all__");
  let loading = $state(true);

  const LEVEL_META: Record<LogLevel, LogLevelMeta> = {
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

  const knownComponents = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const set = new Set<string>();
    for (const l of hookLogStore.logs) if (l.component) set.add(l.component);
    return Array.from(set).sort();
  });

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return hookLogStore.logs.filter((l) => {
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
    for (const l of hookLogStore.logs) s[l.level]++;
    return s;
  });

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

  function resetFilters() {
    search = "";
    activeComponent = "__all__";
  }

  onMount(() => {
    hookLogStore.seedHistory();
    setTimeout(() => {
      loading = false;
      hookLogStore.start();
    }, 650);
  });

  onDestroy(() => {
    hookLogStore.stop();
  });
</script>

<div
  class="bg-background text-foreground flex h-full w-full flex-col rounded-3xl"
>
  <HookLogHeader
    {title}
    bind:search
    bind:activeLevels
    bind:activeComponent
    {knownComponents}
    {stats}
    levelMeta={LEVEL_META}
    connected={hookLogStore.connected}
    paused={hookLogStore.paused}
    onTogglePause={() => hookLogStore.togglePause()}
    onClear={() => hookLogStore.clear()}
    onExport={exportLogs}
  />

  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <HookLogStream
      {filtered}
      {loading}
      {search}
      {activeComponent}
      levelMeta={LEVEL_META}
      onResetFilters={resetFilters}
    />

    <HookLogFooter
      filteredCount={filtered.length}
      totalCount={hookLogStore.logs.length}
      {maxBuffer}
      connected={hookLogStore.connected}
    />
  </div>
</div>

<!-- 需要的组件：Button, Input, Badge, Skeleton, Separator, Tooltip, Select -->
