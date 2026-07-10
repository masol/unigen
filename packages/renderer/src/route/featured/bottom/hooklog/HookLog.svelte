<script lang="ts">
  import { i18nStore } from "$lib/store/i18n.svelte";
  import {
    IconAlertTriangle,
    IconBolt,
    IconBug,
    IconInfoCircle,
    IconMessage,
    IconSparkles,
  } from "@tabler/icons-svelte";
  import type { Dayjs } from "dayjs";
  import type { LogLevel, LogMessage } from "electron-log";
  import { onDestroy, onMount } from "svelte";
  import { hookLogStore } from "./hook-log.store.svelte";
  import HookLogFooter from "./HookLogFooter.svelte";
  import HookLogHeader from "./HookLogHeader.svelte";
  import HookLogStream from "./HookLogStream.svelte";
  import type { LogLevelMeta } from "./types";

  type Props = {
    title?: string;
  };

  let { title = "Logs" }: Props = $props();

  const LEVEL_META: Record<LogLevel, LogLevelMeta> = {
    error: {
      label: "error",
      tone: "text-red-500",
      bar: "bg-red-500",
      chip: "bg-red-500/10 text-red-500 border-red-500/30",
      icon: IconBolt,
    },
    warn: {
      label: "warn",
      tone: "text-amber-500",
      bar: "bg-amber-500",
      chip: "bg-amber-500/10 text-amber-500 border-amber-500/30",
      icon: IconAlertTriangle,
    },
    info: {
      label: "info",
      tone: "text-sky-500",
      bar: "bg-sky-500",
      chip: "bg-sky-500/10 text-sky-500 border-sky-500/30",
      icon: IconInfoCircle,
    },
    verbose: {
      label: "verbose",
      tone: "text-emerald-500",
      bar: "bg-emerald-500",
      chip: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
      icon: IconMessage,
    },
    debug: {
      label: "debug",
      tone: "text-muted-foreground",
      bar: "bg-muted-foreground/50",
      chip: "bg-muted text-muted-foreground border-border/60",
      icon: IconBug,
    },
    silly: {
      label: "silly",
      tone: "text-fuchsia-500",
      bar: "bg-fuchsia-500",
      chip: "bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/30",
      icon: IconSparkles,
    },
  };

  /**
   * 将 LogMessage.data 安全地序列化为可搜索/显示的字符串
   * 使用 i18nStore.dayjs 统一解析各类时间值格式化
   */
  function formatData(data: unknown[]): string {
    if (!Array.isArray(data)) return "";

    // 抽取统一时间格式化逻辑，消除重复代码
    const tryFormatDate = (
      val: string | number | Date | Dayjs | null | undefined,
    ): string | null => {
      const d = i18nStore.dayjs(val);
      return d.isValid() ? d.format("YYYY-MM-DD HH:mm:ss.SSS") : null;
    };

    return data
      .map((item) => {
        if (item === null) return "null";
        if (item === undefined) return "undefined";

        // @ts-expect-error : 字符串、数字、Date、dayjs 统一走时间检测
        const dateStr = tryFormatDate(item);
        if (dateStr !== null) return dateStr;

        if (typeof item === "string") return item;
        if (typeof item === "number" || typeof item === "boolean")
          return String(item);

        if (item instanceof Error) {
          return item.stack || `${item.name}: ${item.message}`;
        }

        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join(" ");
  }

  const filtered = $derived.by(() => {
    const q = hookLogStore.search.trim().toLowerCase();
    return (hookLogStore.logs as LogMessage[]).filter((l) => {
      if (!hookLogStore.activeLevels.has(l.level)) return false;
      if (
        hookLogStore.activeScope !== "__all__" &&
        l.scope !== hookLogStore.activeScope
      )
        return false;
      if (q) {
        const message = formatData(l.data);
        const time =
          l.date instanceof Date ? l.date.toISOString() : String(l.date ?? "");
        const hay =
          `${message} ${l.scope ?? ""} ${l.level} ${time}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  const stats = $derived.by(() => {
    const s: Record<LogLevel, number> = {
      error: 0,
      warn: 0,
      info: 0,
      verbose: 0,
      debug: 0,
      silly: 0,
    };
    for (const l of hookLogStore.logs as LogMessage[]) {
      if (l.level in s) s[l.level]++;
    }
    return s;
  });

  onMount(() => {
    if (!hookLogStore.connected) {
      hookLogStore.start();
    }
  });

  onDestroy(() => {
    if (!hookLogStore.keepalive) {
      hookLogStore.stop();
    }
  });
</script>

<div
  class="bg-background text-foreground flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border/50 shadow-sm"
>
  <HookLogHeader {title} {stats} levelMeta={LEVEL_META} />
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <HookLogStream {filtered} levelMeta={LEVEL_META} {formatData} />
    <HookLogFooter filteredCount={filtered.length} />
  </div>
</div>
