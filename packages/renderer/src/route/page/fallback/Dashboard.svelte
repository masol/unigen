<!-- NovelToVideoDashboard.svelte -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import autoAnimate from "@formkit/auto-animate";

  import { Badge } from "$lib/components/ui/badge";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Separator } from "$lib/components/ui/separator";

  import {
    IconPlayerPlayFilled,
    IconPlayerStopFilled,
    IconBook2,
    IconSparkles,
    IconVideo,
    IconChevronRight,
    IconAlertTriangle,
    IconCircleCheckFilled,
    IconInfoCircle,
    IconClock,
    IconLoader2,
    IconBolt,
    IconDatabase,
    IconCircleDashed,
  } from "@tabler/icons-svelte";
  import { confirmStore } from "$lib/store/ui/confirm.svelte";

  // ─────────────────────────────────────────────────────────────
  // Types & State
  // ─────────────────────────────────────────────────────────────
  type RunState = "idle" | "running" | "terminating";
  type LogLevel = "info" | "success" | "warn" | "error";

  interface LogEntry {
    id: string;
    time: string;
    level: LogLevel;
    message: string;
  }

  interface InfoBlock {
    key: "input" | "spec" | "output";
    title: string;
    subtitle: string;
    summary: string;
    icon: typeof IconBook2;
    metaLabel: string;
    metaTone: "ready" | "pending";
  }

  let runState = $state<RunState>("idle");
  let elapsedSeconds = $state(0);
  let terminatingSeconds = $state(0);
  let logs = $state<LogEntry[]>([]);

  const infoBlocks: InfoBlock[] = [
    {
      key: "input",
      title: "输入",
      subtitle: "小说源文件",
      summary: "《长安十二时辰》· 24 章 · 18.6 万字",
      icon: IconBook2,
      metaLabel: "已就绪",
      metaTone: "ready",
    },
    {
      key: "spec",
      title: "说明要求",
      subtitle: "生成规格",
      summary: "电影风格 · 9:16 竖屏 · 单章约 3 分钟 · 中文配音",
      icon: IconSparkles,
      metaLabel: "已配置",
      metaTone: "ready",
    },
    {
      key: "output",
      title: "输出",
      subtitle: "导出目标",
      summary: "MP4 · 1080×1920 · H.264 · 本地 + 阿里云 OSS",
      icon: IconVideo,
      metaLabel: "待生成",
      metaTone: "pending",
    },
  ];

  // ─────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────
  const statusLabel = $derived(
    runState === "idle"
      ? "空闲"
      : runState === "running"
        ? "运行中"
        : "正在终止",
  );

  const hintText = $derived(
    runState === "idle"
      ? "点击下方按钮，开始将小说转换为视频。"
      : runState === "running"
        ? "每一步结果都会自动保存，再次运行不会重复计算。可随时点击「终止」，已完成的部分不会丢失。"
        : "正在等待当前这一步完成后安全停止。若此刻强制关机，当前正在进行的这一步将作废，需要重新计算。",
  );

  const buttonLabel = $derived(
    runState === "idle"
      ? "开始运行"
      : runState === "running"
        ? "终止任务"
        : "强制停止",
  );

  // ─────────────────────────────────────────────────────────────
  // Mocked logs & timers
  // ─────────────────────────────────────────────────────────────
  const mockMessages: { level: LogLevel; msg: string }[] = [
    { level: "info", msg: "加载小说源文件 …" },
    { level: "success", msg: "文本解析完成 · 共识别 24 章 / 632 个场景" },
    { level: "info", msg: "场景 #001「靖安司初遇」语义分镜中 …" },
    { level: "success", msg: "场景 #001 分镜完成（缓存命中 0 / 8）" },
    { level: "info", msg: "调用 SDXL 生成关键帧 #001-01" },
    { level: "info", msg: "调用 SDXL 生成关键帧 #001-02" },
    { level: "success", msg: "关键帧 #001 全部生成完毕 · 用时 12.4s" },
    { level: "info", msg: "调用 CosyVoice 合成旁白 #001 …" },
    { level: "warn", msg: "场景 #002 命中缓存，跳过重复计算" },
    { level: "success", msg: "旁白 #001 合成完毕 · 时长 00:03:12" },
    { level: "info", msg: "运动模糊与镜头推拉渲染中 …" },
    { level: "success", msg: "章节 1/24 渲染完成 · 输出至 ./out/ch01.mp4" },
  ];

  let logTimer: ReturnType<typeof setInterval> | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let terminateTimer: ReturnType<typeof setInterval> | null = null;
  let msgIndex = 0;

  function nowStr() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  function pushLog(level: LogLevel, message: string) {
    logs = [
      ...logs,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        time: nowStr(),
        level,
        message,
      },
    ];
  }

  function startRunning() {
    runState = "running";
    elapsedSeconds = 0;
    logs = [];
    msgIndex = 0;
    pushLog("info", "任务已启动 · 节点连接正常");

    clockTimer = setInterval(() => {
      elapsedSeconds += 1;
    }, 1000);

    logTimer = setInterval(() => {
      const next = mockMessages[msgIndex % mockMessages.length];
      pushLog(next.level, next.msg);
      msgIndex += 1;
    }, 1400);
  }

  function clearTimers() {
    if (logTimer) clearInterval(logTimer);
    if (clockTimer) clearInterval(clockTimer);
    if (terminateTimer) clearInterval(terminateTimer);
    logTimer = clockTimer = terminateTimer = null;
  }

  function enterTerminating() {
    if (logTimer) {
      clearInterval(logTimer);
      logTimer = null;
    }
    runState = "terminating";
    terminatingSeconds = 0;
    pushLog("warn", "收到终止信号 · 等待当前节点安全收尾 …");
    terminateTimer = setInterval(() => {
      terminatingSeconds += 1;
    }, 1000);

    // 模拟 6 秒后自然结束
    setTimeout(() => {
      if (runState === "terminating")
        finalizeStop("节点收尾完成 · 任务已安全终止");
    }, 6000);
  }

  function finalizeStop(message: string) {
    clearTimers();
    pushLog("success", message);
    runState = "idle";
    elapsedSeconds = 0;
    terminatingSeconds = 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────
  async function handleMainButton() {
    if (runState === "idle") {
      startRunning();
      return;
    }

    if (runState === "running") {
      const ok = await confirmStore.request({
        title: "终止当前任务？",
        message:
          "已完成的步骤会保留，不需要重新计算。当前正在进行的这一步会被安全中止。",
      });
      if (!ok) return;
      enterTerminating();
      return;
    }

    if (runState === "terminating") {
      const ok = await confirmStore.request({
        title: "强制立即停止？",
        message: "当前正在进行的步骤将不会被保存，下次运行需要重新计算这一步。",
      });
      if (!ok) return;
      finalizeStop("已被强制停止 · 最后一步未保存");
    }
  }

  // 占位函数 —— 由外部业务接管
  function openPanel(_key: InfoBlock["key"]) {
    void _key;
  }

  onDestroy(() => clearTimers());

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
</script>

<div
  class="flex h-full min-h-screen w-full flex-col gap-6 bg-background p-8 text-foreground lg:p-12"
>
  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → DashboardHeader.svelte]              │ -->
  <!-- │ 职责：顶部品牌区 + 全局任务状态徽章                  │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <header class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <div
        class="flex size-12 items-center justify-center rounded-2xl border border-border/50 bg-card shadow-sm"
      >
        <IconBolt size={24} stroke={1.5} class="text-primary" />
      </div>
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">
          小说视频化工作台
        </h1>
        <p class="text-sm text-muted-foreground">
          输入小说 · 输出视频 · 全流程自动编排
        </p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <Badge
        variant="outline"
        class="gap-2 rounded-xl border-border/50 px-3 py-1.5 text-xs font-medium"
      >
        {#if runState === "idle"}
          <IconCircleDashed
            size={14}
            stroke={1.5}
            class="text-muted-foreground"
          />
        {:else if runState === "running"}
          <IconLoader2
            size={14}
            stroke={1.5}
            class="animate-spin text-primary"
          />
        {:else}
          <IconAlertTriangle size={14} stroke={1.5} class="text-amber-500" />
        {/if}
        <span>状态：{statusLabel}</span>
      </Badge>

      {#if runState !== "idle"}
        <Badge
          variant="outline"
          class="gap-2 rounded-xl border-border/50 px-3 py-1.5 text-xs"
        >
          <IconClock size={14} stroke={1.5} class="text-muted-foreground" />
          <span class="font-mono">{fmtTime(elapsedSeconds)}</span>
        </Badge>
      {/if}
    </div>
  </header>
  <!-- ╭─── / DashboardHeader ───╮ -->

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → RunControlCard.svelte]               │ -->
  <!-- │ 职责：核心运行按钮 + 动态提示文案                    │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <section
    class="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 shadow-sm lg:p-12"
  >
    <!-- 背景装饰 -->
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--color-primary),transparent_60%)]/8"
    ></div>

    <div class="relative flex flex-col items-center gap-6 text-center">
      <div use:autoAnimate class="flex min-h-10 items-center justify-center">
        {#if runState === "idle"}
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <IconInfoCircle size={16} stroke={1.5} />
            <span>{hintText}</span>
          </div>
        {:else if runState === "running"}
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <IconDatabase size={16} stroke={1.5} class="text-primary" />
            <span>{hintText}</span>
          </div>
        {:else}
          <div
            class="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500"
          >
            <IconAlertTriangle size={16} stroke={1.5} />
            <span>{hintText}</span>
          </div>
        {/if}
      </div>

      <button
        type="button"
        onclick={handleMainButton}
        class={[
          "group relative flex size-44 items-center justify-center rounded-full border border-border/50 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
          runState === "idle" && "bg-primary text-primary-foreground",
          runState === "running" && "bg-card text-foreground",
          runState === "terminating" &&
            "bg-destructive text-destructive-foreground",
        ]}
        aria-label={buttonLabel}
      >
        {#if runState === "running"}
          <span
            class="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping"
          ></span>
          <span class="absolute inset-2 rounded-full border border-primary/60"
          ></span>
        {/if}

        <div class="relative flex flex-col items-center gap-2">
          {#if runState === "idle"}
            <IconPlayerPlayFilled size={48} stroke={1.5} />
          {:else if runState === "running"}
            <IconPlayerStopFilled
              size={44}
              stroke={1.5}
              class="text-foreground"
            />
          {:else}
            <IconLoader2 size={44} stroke={1.5} class="animate-spin" />
          {/if}
          <span class="text-sm font-medium tracking-wide">{buttonLabel}</span>
        </div>
      </button>

      {#if runState === "terminating"}
        <div
          class="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/50 px-4 py-2 text-xs text-muted-foreground animate-fade-in"
        >
          <IconClock size={14} stroke={1.5} />
          <span
            >已等待 <span class="font-mono text-foreground"
              >{fmtTime(terminatingSeconds)}</span
            > · 通常需要 30 秒以内</span
          >
        </div>
      {/if}
    </div>
  </section>
  <!-- ╭─── / RunControlCard ───╮ -->

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → DashboardBody.svelte]                │ -->
  <!-- │ 职责：根据运行状态切换「信息块网格」/「日志面板」    │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <section use:autoAnimate class="flex-1">
    {#if runState === "idle"}
      <!--╭─────────────────────────────────────────────────────╮ -->
      <!-- │ [可抽取子组件 → InfoBlocksGrid.svelte]               │ -->
      <!-- │ 职责：三宫格信息卡（输入 / 要求 / 输出）入口         │ -->
      <!-- ╰─────────────────────────────────────────────────────╯ -->
      <div class="grid grid-cols-1 gap-6 md:grid-cols-3 animate-fade-in">
        {#each infoBlocks as block (block.key)}
          <button
            type="button"
            onclick={() => openPanel(block.key)}
            class="group flex flex-col gap-5 rounded-2xl border border-border/50 bg-card p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div class="flex items-start justify-between">
              <div
                class="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
              >
                <block.icon size={20} stroke={1.5} />
              </div>
              <Badge
                variant="outline"
                class={[
                  "rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-medium",
                  block.metaTone === "ready"
                    ? "text-emerald-600 dark:text-emerald-500"
                    : "text-muted-foreground",
                ]}
              >
                {#if block.metaTone === "ready"}
                  <IconCircleCheckFilled size={12} stroke={1.5} class="mr-1" />
                {/if}
                {block.metaLabel}
              </Badge>
            </div>

            <div class="space-y-2">
              <div class="flex items-baseline gap-2">
                <h3 class="text-lg font-medium">{block.title}</h3>
                <span class="text-xs text-muted-foreground"
                  >{block.subtitle}</span
                >
              </div>
              <p class="text-sm leading-relaxed text-foreground">
                {block.summary}
              </p>
            </div>

            <div
              class="mt-auto flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground"
            >
              <span>点击进行配置</span>
              <IconChevronRight
                size={16}
                stroke={1.5}
                class="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </div>
          </button>
        {/each}
      </div>
      <!-- ╭─── / InfoBlocksGrid ───╮ -->
    {:else}
      <!--╭─────────────────────────────────────────────────────╮ -->
      <!-- │ [可抽取子组件 → RunLogPanel.svelte]                  │ -->
      <!-- │ 职责：运行 / 终止态下的滚动日志面板                  │ -->
      <!-- ╰─────────────────────────────────────────────────────╯ -->
      <div
        class="flex h-full min-h-112 flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm animate-fade-in"
      >
        <div
          class="flex items-center justify-between border-b border-border/50 px-6 py-4"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex size-9 items-center justify-center rounded-xl bg-muted"
            >
              <IconDatabase size={18} stroke={1.5} class="text-primary" />
            </div>
            <div>
              <h3 class="text-lg font-medium leading-tight">运行日志</h3>
              <p class="text-xs text-muted-foreground">
                实时输出 · 全部结果自动缓存
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Badge
              variant="outline"
              class="rounded-lg border-border/50 px-2 py-0.5 text-[10px]"
            >
              {logs.length} 条
            </Badge>
            <Separator orientation="vertical" class="h-5" />
            <Badge
              variant="outline"
              class="gap-1.5 rounded-lg border-border/50 px-2 py-0.5 text-[10px] font-mono"
            >
              <IconClock size={12} stroke={1.5} />
              {fmtTime(elapsedSeconds)}
            </Badge>
          </div>
        </div>

        <ScrollArea class="flex-1">
          <ul use:autoAnimate class="flex flex-col gap-1 p-4">
            {#each logs as log (log.id)}
              <li
                class="flex items-start gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 hover:bg-muted/60"
              >
                <span
                  class="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground"
                >
                  {log.time}
                </span>

                <span class="mt-0.5 shrink-0">
                  {#if log.level === "success"}
                    <IconCircleCheckFilled
                      size={14}
                      stroke={1.5}
                      class="text-emerald-500"
                    />
                  {:else if log.level === "warn"}
                    <IconAlertTriangle
                      size={14}
                      stroke={1.5}
                      class="text-amber-500"
                    />
                  {:else if log.level === "error"}
                    <IconAlertTriangle
                      size={14}
                      stroke={1.5}
                      class="text-destructive"
                    />
                  {:else}
                    <IconCircleDashed
                      size={14}
                      stroke={1.5}
                      class="text-muted-foreground"
                    />
                  {/if}
                </span>

                <span
                  class={[
                    "flex-1 leading-relaxed",
                    log.level === "warn" &&
                      "text-amber-700 dark:text-amber-500",
                    log.level === "error" && "text-destructive",
                    log.level === "success" && "text-foreground",
                    log.level === "info" && "text-foreground",
                  ]}
                >
                  {log.message}
                </span>
              </li>
            {/each}

            {#if runState === "running"}
              <li
                class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground"
              >
                <span class="font-mono text-xs">{nowStr()}</span>
                <IconLoader2
                  size={14}
                  stroke={1.5}
                  class="animate-spin text-primary"
                />
                <span>等待下一节点输出 …</span>
              </li>
            {/if}
          </ul>
        </ScrollArea>
      </div>
      <!-- ╭─── / RunLogPanel ───╮ -->
    {/if}
  </section>
  <!-- ╭─── / DashboardBody ───╮ -->
</div>
