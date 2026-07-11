<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { i18nStore } from "$lib/store/i18n.svelte";
  import { recentProjectsStore } from "$lib/store/recent-projects.svelte";
  import type { RecentProject } from "@app/main/types";
  import { IconClock, IconFolder } from "@tabler/icons-svelte";

  function formatDate(ts: number) {
    return i18nStore.dayjs(ts).fromNow();
  }

  function handleOpen(project: RecentProject) {
    void recentProjectsStore.open(project);
  }

  // 从路径里推断显示名（type 中无 name 字段，取最后一段）
  function pickName(path: string): string {
    const seg = path.replace(/[\\/]+$/, "").split(/[\\/]/);
    return seg[seg.length - 1] || path;
  }
</script>

<section class="space-y-3">
  <div
    class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
  >
    <IconClock class="size-4" />
    <span>最近项目</span>
  </div>

  {#if recentProjectsStore.isLoading}
    <ul class="space-y-1.5">
      {#each Array.from({ length: 3 }, (_, i) => i) as idx (idx)}
        <li class="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <Skeleton class="size-8 rounded-md" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-3.5 w-32" />
            <Skeleton class="h-3 w-56" />
          </div>
          <Skeleton class="h-3 w-16" />
        </li>
      {/each}
    </ul>
  {:else if recentProjectsStore.error}
    <p class="text-sm text-muted-foreground">
      加载失败：{recentProjectsStore.error}
    </p>
  {:else if recentProjectsStore.isEmpty}
    <p class="text-sm text-muted-foreground">暂无最近项目</p>
  {:else}
    <ul class="space-y-1">
      {#each recentProjectsStore.projects as project (project.path)}
        <li>
          <button
            type="button"
            onclick={() => handleOpen(project)}
            class="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent"
          >
            <IconFolder
              class="size-5 shrink-0 text-muted-foreground group-hover:text-foreground"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">
                {pickName(project.path)}
              </div>
              <div class="truncate text-xs text-muted-foreground">
                {project.path}
              </div>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground">
              {formatDate(project.time)}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
