<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { messageStore } from "$lib/store/local/msg.svelte";
  import { taskProgressStore } from "$lib/store/task-progress.svelte";
  import { safeApi } from "$lib/utils/api";
  import { onDestroy, onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import RuntimeCard from "./RuntimeCard.svelte";
  import WarningCard from "./WarningCard.svelte";
  import type { CodeRuntimeEntry } from "./types";

  let entries = $state<CodeRuntimeEntry[]>([]);
  let loading = $state(true);
  let pending = $state<Record<string, boolean>>({});

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  // 非响应式去重表：只在 $effect 内读写，避免引入不必要的 SvelteSet。
  // 记录每个 code-runtime 任务最近一次被观察到的终态，用于触发一次刷新。
  const settledTasks: Record<string, string> = {};

  function taskIdOf(id: string): string {
    return `code-runtime:${id}`;
  }

  async function load(showLoading = true): Promise<void> {
    if (showLoading) loading = true;
    try {
      const result = await safeApi().code.listRuntimes();
      if (result) entries = result;
    } finally {
      if (showLoading) loading = false;
    }
  }

  function scheduleReload(): void {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void load(false);
    }, 120);
  }

  async function setEnabled(
    entry: CodeRuntimeEntry,
    enabled: boolean,
  ): Promise<void> {
    const id = entry.info.id;
    if (pending[id]) return;
    pending[id] = true;
    try {
      const updated = await safeApi().code.setRuntimeEnabled({ id, enabled });
      if (updated) {
        entries = entries.map((row) => (row.info.id === id ? updated : row));
      } else {
        await load(false);
      }

      // 禁用路径：主进程使用 `void codeRuntimeManager.disableEngine(...)`
      // 的 fire-and-forget 注销，没有任务推送；延迟一拍再刷新内建工具列表，
      // 避免与主进程的注销竞争。启用路径由下方 $effect 在任务终态时刷新。
      if (!enabled) {
        setTimeout(() => {
          void messageStore.init();
        }, 300);
      }
    } finally {
      pending[id] = false;
    }
  }

  onMount(() => {
    void load();
  });

  onDestroy(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
  });

  /**
   * 安装任务的状态以主进程推送的 task:update 为准（RuntimeCard 直接读
   * taskProgressStore）。当某个 code-runtime 任务结束后，这里触发一次
   * 列表刷新，把 entries 中的 state 收敛为最终的 ready / failed；
   * 同时把内建工具列表刷新一遍，让 AI 侧立刻看到新注册 / 已注销的工具。
   */
  $effect(() => {
    for (const entry of entries) {
      const taskId = taskIdOf(entry.info.id);
      const task = taskProgressStore.get(taskId);
      if (!task) continue;

      const status = task.status;
      if (
        status !== "completed" &&
        status !== "failed" &&
        status !== "cancelled"
      ) {
        continue;
      }

      const stamp = `${status}:${task.finishedAt ?? task.updatedAt}`;
      if (settledTasks[taskId] === stamp) continue;
      settledTasks[taskId] = stamp;
      scheduleReload();
      void messageStore.init();
    }
  });
</script>

<div class="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-6 md:p-8">
  <header class="space-y-1">
    <h1 class="text-xl font-semibold tracking-tight text-foreground">
      编程环境
    </h1>
    <p class="text-sm text-muted-foreground">
      管理本机编程环境。让 AI 可以自行编写并执行代码(Everything as Code)。
    </p>
  </header>

  <WarningCard />

  {#if loading}
    <div class="space-y-3">
      {#each Array(2) as _, i (i)}
        <Skeleton class="h-28 rounded-2xl" />
      {/each}
    </div>
  {:else if entries.length === 0}
    <div
      in:fade={{ duration: 180, easing: cubicInOut }}
      class="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground"
    >
      当前版本暂未提供可用的代码环境。
    </div>
  {:else}
    <div class="space-y-3" in:fade={{ duration: 180, easing: cubicInOut }}>
      {#each entries as entry (entry.info.id)}
        <RuntimeCard
          info={entry.info}
          runtimeState={entry.state}
          task={taskProgressStore.get(taskIdOf(entry.info.id))}
          busy={Boolean(pending[entry.info.id])}
          onToggle={(enabled) => void setEnabled(entry, enabled)}
        />
      {/each}
    </div>
  {/if}
</div>
