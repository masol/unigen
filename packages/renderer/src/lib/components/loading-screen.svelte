<!-- src/lib/components/loading-screen.svelte -->
<script lang="ts">
  import {
    taskProgressStore,
    type TaskSnapshot,
  } from "$lib/store/task-progress.svelte";
  import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-svelte";
  import { Motion } from "svelte-motion";

  // ── 启动任务 id ────────────────────────────────────────────
  const STARTUP_ID = "startup";

  /** 在首帧 store 尚未收到主进程快照前的兜底占位 */
  const FALLBACK: TaskSnapshot = {
    id: STARTUP_ID,
    title: "启动",
    phase: "starting",
    message: "正在启动",
    progress: 15,
    status: "running",
    warnings: [],
    startedAt: 0,
    updatedAt: 0,
  };

  /**
   * 只读 store 的快照：Svelte 5 会自动追踪 `#tasks[id]` 的 key 级更新，
   * 无需订阅事件、无需自己 onMount。
   */
  const progress = $derived(taskProgressStore.get(STARTUP_ID) ?? FALLBACK);

  // 装饰性流动光斑配置
  const orbs = [
    {
      size: 340,
      x: -120,
      y: -80,
      delay: 0,
      color: "from-sky-400/30 to-indigo-500/20",
    },
    {
      size: 260,
      x: 160,
      y: 120,
      delay: 0.6,
      color: "from-fuchsia-400/25 to-purple-500/15",
    },
    {
      size: 200,
      x: 60,
      y: -160,
      delay: 1.2,
      color: "from-emerald-400/25 to-teal-500/15",
    },
  ];
</script>

<div
  class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden
         bg-linear-to-b from-slate-50 via-white to-slate-100
         dark:from-slate-950 dark:via-slate-900 dark:to-black"
>
  <!-- 背景流动光斑 -->
  {#each orbs as orb (orb.delay)}
    <Motion
      let:motion
      animate={{
        x: [orb.x, orb.x + 30, orb.x],
        y: [orb.y, orb.y - 40, orb.y],
        scale: [1, 1.15, 1],
        opacity: [0.6, 0.9, 0.6],
      }}
      transition={{
        duration: 6,
        delay: orb.delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <div
        use:motion
        class="pointer-events-none absolute rounded-full bg-linear-to-br blur-3xl {orb.color}"
        style="width:{orb.size}px;height:{orb.size}px;"
      ></div>
    </Motion>
  {/each}

  <!-- 中心内容 -->
  <div
    class="relative z-10 flex w-full max-w-xl flex-col items-center gap-6 px-6"
  >
    <!-- 旋转双环 + 脉冲核心 -->
    <div class="relative grid place-items-center">
      <Motion
        let:motion
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
      >
        <div
          use:motion
          class="h-24 w-24 rounded-full border-[3px] border-transparent
                 border-t-sky-500 border-r-sky-400/60
                 sm:h-28 sm:w-28 dark:border-t-sky-400 dark:border-r-sky-300/50"
        ></div>
      </Motion>

      <Motion
        let:motion
        animate={{ rotate: -360 }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
      >
        <div
          use:motion
          class="absolute h-16 w-16 rounded-full border-[3px] border-transparent
                 border-b-indigo-500 border-l-indigo-400/60
                 sm:h-20 sm:w-20 dark:border-b-indigo-400 dark:border-l-indigo-300/50"
        ></div>
      </Motion>

      <Motion
        let:motion
        animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          use:motion
          class="absolute h-6 w-6 rounded-full bg-linear-to-br from-sky-400 to-indigo-500
                 shadow-lg shadow-sky-500/40 sm:h-7 sm:w-7"
        ></div>
      </Motion>
    </div>

    <!-- 标题文案 + 跳动省略号 -->
    <div class="flex w-full flex-col items-center gap-1.5 text-center">
      <h1
        class="flex items-center text-xl font-semibold tracking-wide
               text-slate-800 sm:text-2xl dark:text-slate-100"
      >
        {progress.message}
        <span class="ml-0.5 inline-flex">
          {#each [0, 1, 2] as dot (dot)}
            <Motion
              let:motion
              animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
              transition={{
                duration: 1.2,
                delay: dot * 0.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <span use:motion class="inline-block">.</span>
            </Motion>
          {/each}
        </span>
      </h1>
      <p class="text-xs text-slate-500 sm:text-sm dark:text-slate-400">
        阶段：{progress.phase}
      </p>
    </div>

    <!-- 进度条 -->
    <div
      class="relative h-1 w-full max-w-md overflow-hidden rounded-full bg-slate-200/70
             dark:bg-slate-700/50"
    >
      <Motion
        let:motion
        initial={{ width: "0%" }}
        animate={{ width: `${Math.max(2, progress.progress)}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div
          use:motion
          class="h-full rounded-full bg-linear-to-r from-sky-500 to-indigo-500
                 dark:from-sky-400 dark:to-indigo-400"
        ></div>
      </Motion>
    </div>

    <div class="text-[11px] text-slate-400 dark:text-slate-500">
      {progress.progress}%
    </div>

    <!-- 警告列表：store 中 warnings 已在主进程去重，这里直接遍历 -->
    {#if progress.warnings.length > 0}
      <Motion
        let:motion
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div use:motion class="mt-2 w-full space-y-2">
          {#each progress.warnings as w (w.id)}
            <div
              class="flex items-start gap-2 rounded-lg border px-3 py-2 text-left
                     {w.level === 'error'
                ? 'border-red-500/30 bg-red-500/10'
                : w.level === 'warn'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-sky-500/30 bg-sky-500/10'}"
            >
              {#if w.level === "error"}
                <IconAlertTriangle
                  class="mt-0.5 size-4 shrink-0 text-red-500"
                />
              {:else if w.level === "warn"}
                <IconAlertTriangle
                  class="mt-0.5 size-4 shrink-0 text-amber-500"
                />
              {:else}
                <IconInfoCircle class="mt-0.5 size-4 shrink-0 text-sky-500" />
              {/if}
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-foreground">{w.message}</p>
                {#if w.detail}
                  <p
                    class="mt-0.5 text-[11px] leading-relaxed wrap-break-word text-muted-foreground"
                  >
                    {w.detail}
                  </p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </Motion>
    {/if}
  </div>

  <!-- 底部品牌占位 -->
  <div
    class="absolute bottom-6 z-10 text-xs text-slate-400/80 dark:text-slate-600"
  >
    正在为您准备最佳体验
  </div>
</div>
