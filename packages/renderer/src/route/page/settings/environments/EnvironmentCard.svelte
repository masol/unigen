<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    IconChevronRight,
    IconCloud,
    IconRefresh,
    IconServer2,
  } from "@tabler/icons-svelte";
  import { environmentsStore } from "./store.svelte";
  import type { EnvironmentSummary } from "./types";

  type Props = {
    env: EnvironmentSummary;
    onOpen: () => void;
  };
  let { env, onOpen }: Props = $props();

  const isLocal = $derived(env.transport === "local");

  const statusLabel = $derived(
    env.status === "online"
      ? "已连接"
      : env.status === "offline"
        ? "未连接"
        : env.status === "checking"
          ? "检测中"
          : env.status === "error"
            ? "检测失败"
            : "未检测",
  );

  const statusClass = $derived(
    env.status === "online"
      ? "bg-emerald-500/10 text-emerald-700"
      : env.status === "offline" || env.status === "error"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground",
  );

  const endpoint = $derived(
    isLocal
      ? "本机"
      : env.ssh
        ? `${env.ssh.user}@${env.ssh.host}${env.ssh.port ? `:${env.ssh.port}` : ""}`
        : "未配置 SSH",
  );
</script>

<div
  class="group flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-5 transition-all hover:border-border hover:shadow-sm"
>
  <button
    type="button"
    onclick={onOpen}
    class="flex items-start gap-3 text-left"
  >
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
    >
      {#if isLocal}
        <IconServer2 class="size-5" />
      {:else}
        <IconCloud class="size-5" />
      {/if}
    </span>
    <div class="min-w-0 flex-1 space-y-0.5">
      <p class="truncate text-sm font-semibold text-foreground">{env.name}</p>
      <p class="truncate text-xs text-muted-foreground">{env.description}</p>
      <p class="truncate text-[11px] text-muted-foreground/70">{endpoint}</p>
    </div>
    <span
      class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium {statusClass}"
    >
      {statusLabel}
    </span>
  </button>

  <div class="flex items-center justify-between gap-2">
    <Button
      variant="ghost"
      size="sm"
      class="gap-1.5 rounded-lg text-muted-foreground"
      onclick={() => environmentsStore.probe(env.id)}
      disabled={env.status === "checking"}
    >
      <IconRefresh
        class="size-4 {env.status === 'checking' ? 'animate-spin' : ''}"
      />
      重新检测
    </Button>
    <button
      type="button"
      onclick={onOpen}
      class="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
    >
      打开配置
      <IconChevronRight class="size-3.5" />
    </button>
  </div>
</div>
