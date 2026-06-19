<script lang="ts">
  import { IconClock, IconFolder } from "@tabler/icons-svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { i18nStore } from "$lib/store/i18n.svelte";

  interface RecentProject {
    id: string;
    name: string;
    path: string;
    lastOpenedAt: number;
  }

  let projects = $state<RecentProject[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      // 人为延时，体现加载效果；正式环境可去掉
      await new Promise((r) => setTimeout(r, 600));
      projects = [];
      //   projects = await api().<RecentProject[]>("/recent-projects");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  function formatDate(ts: number) {
    return i18nStore.dayjs(ts).fromNow();
  }

  function handleOpen(project: RecentProject) {
    // TODO: 打开指定项目
    void project;
  }
</script>

<section class="space-y-3">
  <div
    class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
  >
    <IconClock class="size-4" />
    <span>最近项目</span>
  </div>

  {#if loading}
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
  {:else if error}
    <p class="text-sm text-muted-foreground">加载失败：{error}</p>
  {:else if projects.length === 0}
    <p class="text-sm text-muted-foreground">暂无最近项目</p>
  {:else}
    <ul class="space-y-1">
      {#each projects as project (project.id)}
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
              <div class="truncate text-sm font-medium">{project.name}</div>
              <div class="truncate text-xs text-muted-foreground">
                {project.path}
              </div>
            </div>
            <span class="shrink-0 text-xs text-muted-foreground">
              {formatDate(project.lastOpenedAt)}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
