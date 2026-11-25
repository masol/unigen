<script lang="ts">
  import { fetchInstalledProjectTypes } from "$lib/components/dialog/project-type/service";
  import type { ProjectType } from "$lib/components/dialog/project-type/types";
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { PinyinFuseSearch } from "$lib/utils/fuse";
  import { IconMoodEmpty, IconRefresh, IconSearch } from "@tabler/icons-svelte";
  import { default as log } from "electron-log/renderer";
  import { onMount } from "svelte";

  const SKELETON_ROWS = 3;

  let types = $state<ProjectType[]>([]);
  let query = $state(""); // 输入框即时值，过滤在客户端派生
  let loading = $state(true); // 首次加载
  let refreshing = $state(false); // 强制刷新，保留旧列表
  let error = $state<string | null>(null);
  let loadVersion = 0; // 丢弃过期响应

  const searcher = $derived(
    new PinyinFuseSearch(
      types.map((t) => ({
        id: t.id,
        text: `${t.id} ${t.name} ${t.description}`,
      })),
    ),
  );

  const filtered = $derived.by<ProjectType[]>(() => {
    const q = query.trim();
    if (!q) return types;
    const ids = new Set(searcher.search(q) as Array<string | number>);
    return types.filter((t) => ids.has(t.id));
  });

  function toMessage(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
  }

  async function load(force = false): Promise<void> {
    const version = ++loadVersion;
    error = null;

    if (force) {
      refreshing = true;
    } else {
      loading = true;
    }

    try {
      const next = await fetchInstalledProjectTypes(force);
      if (version !== loadVersion) return;
      types = next;
    } catch (cause) {
      if (version !== loadVersion) return;
      error = `加载项目类型失败：${toMessage(cause)}`;
      log.error("[ProjectTypeSettings] load failed", cause);
    } finally {
      if (version === loadVersion) {
        loading = false;
        refreshing = false;
      }
    }
  }

  function handleRefresh(): void {
    if (loading || refreshing) return;
    void load(true);
  }

  onMount(() => {
    void load();
  });
</script>

<section class="space-y-4">
  <h2 class="px-1 text-lg font-medium text-foreground">项目配置</h2>

  <div
    class="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-200 hover:border-border hover:shadow-lg"
  >
    <!-- 搜索 + 刷新：刷新为 ghost 图标，刻意低调，不抢焦点 -->
    <div class="flex items-center gap-2 p-3">
      <div class="relative min-w-0 flex-1">
        <IconSearch
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          bind:value={query}
          placeholder="搜索项目类型…"
          aria-label="搜索项目类型"
          class="rounded-xl pl-9"
          disabled={loading}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onclick={handleRefresh}
        disabled={loading || refreshing}
        aria-label="刷新项目类型"
        title="刷新项目类型"
        class="shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <IconRefresh class="size-4 {refreshing ? 'animate-spin' : ''}" />
      </Button>
    </div>

    <div class="border-t border-border/50">
      {#if loading}
        <div class="space-y-2 p-3">
          {#each Array(SKELETON_ROWS) as _, i (i)}
            <Skeleton class="h-14 rounded-xl" />
          {/each}
        </div>
      {:else if types.length === 0}
        <div
          class="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center"
        >
          <IconMoodEmpty class="size-8 text-muted-foreground" />
          <p class="text-sm text-foreground">尚未安装任何项目类型</p>
        </div>
      {:else if filtered.length === 0}
        <div
          class="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center"
        >
          <IconMoodEmpty class="size-8 text-muted-foreground" />
          <p class="text-sm text-foreground">没有匹配的项目类型</p>
          <p class="text-xs text-muted-foreground">换个关键词试试。</p>
        </div>
      {:else}
        <div class="divide-y divide-border/50">
          {#each filtered as type (type.id)}
            <div class="flex items-start gap-4 px-4 py-3">
              <span
                class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <RuntimeIcon name={type.icon} size={18} />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-foreground">
                  {type.name}
                </p>
                {#if type.description}
                  <p
                    class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    {type.description}
                  </p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if error}
      <div class="border-t border-border/50 px-4 py-2">
        <p class="text-xs text-destructive" role="alert">{error}</p>
      </div>
    {/if}
  </div>
</section>
