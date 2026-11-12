<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import {
    IconFolderOpen,
    IconHelpCircle,
    IconLoader2,
    IconPlus,
    IconSearch,
    IconSparkles,
    IconX,
  } from "@tabler/icons-svelte";

  let {
    totalCount = 0,
    visibleCount = 0,
    query = $bindable(""),
    installing = false,
    onInstall,
    onOpenDirectory,
    onShowMarkets,
  }: {
    totalCount?: number;
    visibleCount?: number;
    query?: string;
    installing?: boolean;
    onInstall?: () => void;
    onOpenDirectory?: () => void;
    onShowMarkets?: () => void;
  } = $props();
</script>

<header class="space-y-6">
  <div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">技能</h1>

        <Button
          variant="ghost"
          size="icon"
          class="size-8 rounded-lg text-muted-foreground/70 transition-all duration-200 hover:text-foreground"
          aria-label="常见市场"
          title="常见市场"
          onclick={() => onShowMarkets?.()}
        >
          <IconHelpCircle size={16} stroke={1.5} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          class="size-8 rounded-lg text-muted-foreground/70 transition-all duration-200 hover:text-foreground"
          aria-label="打开技能目录"
          title="打开技能目录"
          onclick={() => onOpenDirectory?.()}
        >
          <IconFolderOpen size={16} stroke={1.5} />
        </Button>
      </div>

      <p class="text-sm text-muted-foreground">安装和管理 Agent 可调用的技能</p>

      <div
        class="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground"
      >
        <span class="flex items-center gap-1.5">
          <IconSparkles size={14} stroke={1.5} />
          {totalCount} 个技能
        </span>
        {#if query.trim()}
          <span class="text-border">·</span>
          <span>显示 {visibleCount} 个</span>
        {/if}
      </div>
    </div>

    <Button
      class="gap-2 self-start rounded-xl sm:self-auto"
      disabled={installing}
      aria-busy={installing}
      onclick={() => onInstall?.()}
    >
      {#if installing}
        <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
        安装中
      {:else}
        <IconPlus size={16} stroke={1.5} />
        安装技能
      {/if}
    </Button>
  </div>

  <div class="relative">
    <IconSearch
      size={16}
      stroke={1.5}
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      bind:value={query}
      placeholder="搜索技能名称、描述或路径…"
      class="rounded-xl pl-9 pr-9"
    />
    {#if query}
      <button
        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
        onclick={() => (query = "")}
        type="button"
        aria-label="清除搜索"
      >
        <IconX size={14} stroke={1.5} />
      </button>
    {/if}
  </div>
</header>
