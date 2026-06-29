<!-- 职责：核心运行按钮 + 动态提示文案 + 运行终止点设置。点击调用 store 方法。 -->
<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconPlayerPlayFilled,
    IconPlayerStopFilled,
    IconLoader2,
    IconInfoCircle,
    IconDatabase,
    IconAlertTriangle,
    IconClock,
    IconFlag,
    IconCheck,
    IconChevronDown,
    IconScissors,
    IconCamera,
    IconUsers,
    IconMicrophone,
    IconLayoutGrid,
    IconPalette,
    IconVideo,
    IconWand,
  } from "@tabler/icons-svelte";
  import * as Select from "$lib/components/ui/select";
  import { dashboardStore, type RunTarget } from "./dashboard.svelte";
  import { tourStore } from "$lib/store/ui/tour.svelte";
  import type { Step } from "$lib/components/ui/walkthrough/ctx";
  import { inputStore } from "../../../../plugins/video/mainsrv/leftbar/input-manager";

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  // 终止点元数据 - 全局唯一来源
  const TARGET_OPTIONS: {
    value: RunTarget;
    label: string;
    desc: string;
    icon: typeof IconScissors;
    step: number;
  }[] = [
    {
      value: "segmentation",
      label: "剧本分段",
      desc: "完成剧本切分后停止",
      icon: IconScissors,
      step: 1,
    },
    {
      value: "shot",
      label: "镜头规划",
      desc: "完成镜头序列拆分后停止",
      icon: IconCamera,
      step: 2,
    },
    {
      value: "entities",
      label: "实体生成",
      desc: "完成人物 / 场景实体抽取后停止",
      icon: IconUsers,
      step: 3,
    },
    {
      value: "voice",
      label: "语音生成",
      desc: "完成台词配音合成后停止",
      icon: IconMicrophone,
      step: 4,
    },
    {
      value: "storyboard",
      label: "分镜绘制",
      desc: "完成分镜草图后停止",
      icon: IconLayoutGrid,
      step: 5,
    },
    {
      value: "visual",
      label: "视觉生成",
      desc: "完成关键帧成片渲染后停止",
      icon: IconPalette,
      step: 6,
    },
    {
      value: "video",
      label: "视频生成",
      desc: "完成视频片段合成后停止",
      icon: IconVideo,
      step: 7,
    },
    {
      value: "post",
      label: "后期处理",
      desc: "完成全流程产出最终交付",
      icon: IconWand,
      step: 8,
    },
  ];

  let isUpdatingTarget = $state(false);

  let currentTarget = $derived(
    TARGET_OPTIONS.find((o) => o.value === dashboardStore.target) ??
      TARGET_OPTIONS[TARGET_OPTIONS.length - 1],
  );

  let isLocked = $derived(
    dashboardStore.runState !== "idle" || isUpdatingTarget,
  );

  async function handleTargetChange(value: string | undefined) {
    if (!value || value === dashboardStore.target) return;
    isUpdatingTarget = true;
    try {
      await dashboardStore.setTarget(value as RunTarget);
    } finally {
      isUpdatingTarget = false;
    }
  }

  const steps: Step[] = [
    {
      target: "ib-input-manager",
      title: "没有剧本",
      description: "点击这里打开剧本集管理，添加剧本后，开始运行",
      position: "top",
    },
  ];

  async function handleMainbutton(): Promise<void> {
    if (dashboardStore.runState === "idle") {
      const totalSize = inputStore.scripts.reduce((acc, item) => {
        return acc + item.size;
      }, 0);
      if (totalSize <= 0) {
        tourStore.start(steps);
        return;
      }
    }
    await dashboardStore.handleMainButton();
  }
</script>

<section
  class="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 shadow-sm lg:p-12"
>
  <div
    class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--color-primary),transparent_60%)]/8"
  ></div>

  <div class="relative flex flex-col items-center gap-8">
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → RunTargetSelector.svelte]          │ -->
    <!-- │ 职责：运行终止点下拉选择器，支持禁用与异步加载态     │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div class="flex w-full max-w-md flex-col items-center gap-3">
      <div
        class="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        <IconFlag size={14} stroke={1.5} />
        <span>运行终止点</span>
      </div>

      <Select.Root
        type="single"
        value={dashboardStore.target}
        onValueChange={handleTargetChange}
        disabled={isLocked}
      >
        <Select.Trigger
          class="group flex h-auto w-full items-center justify-between gap-3 rounded-xl border border-border/50 bg-background px-4 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div
              class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              {#if isUpdatingTarget}
                <IconLoader2 size={18} stroke={1.5} class="animate-spin" />
              {:else}
                <currentTarget.icon size={18} stroke={1.5} />
              {/if}
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-foreground">
                  {currentTarget.label}
                </span>
                <span
                  class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  STEP {currentTarget.step}/8
                </span>
              </div>
              <span class="truncate text-xs text-muted-foreground">
                {isUpdatingTarget ? "正在同步配置…" : currentTarget.desc}
              </span>
            </div>
          </div>
          <IconChevronDown
            size={18}
            stroke={1.5}
            class="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </Select.Trigger>

        <Select.Content
          class="rounded-xl border border-border/50 p-2 shadow-xl"
        >
          {#each TARGET_OPTIONS as opt (opt.value)}
            <Select.Item
              value={opt.value}
              class="group/item flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-all duration-200 data-highlighted:bg-muted"
            >
              {#snippet children({ selected })}
                <div
                  class={[
                    "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover/item:bg-primary/10 group-hover/item:text-primary",
                  ]}
                >
                  <opt.icon size={16} stroke={1.5} />
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-foreground">
                      {opt.label}
                    </span>
                    <span
                      class="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {opt.step}/8
                    </span>
                  </div>
                  <span class="truncate text-xs text-muted-foreground">
                    {opt.desc}
                  </span>
                </div>
                {#if selected}
                  <IconCheck
                    size={16}
                    stroke={1.5}
                    class="shrink-0 text-primary"
                  />
                {/if}
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>

      {#if dashboardStore.runState !== "idle"}
        <p
          class="flex items-center gap-1.5 text-[11px] text-muted-foreground animate-fade-in"
        >
          <IconInfoCircle size={12} stroke={1.5} />
          <span>运行期间不可修改终止点</span>
        </p>
      {/if}
    </div>
    <!-- ╭─── / RunTargetSelector ───╮ -->

    <div class="h-px w-full max-w-md bg-border/50"></div>

    <div use:autoAnimate class="flex min-h-10 items-center justify-center">
      {#if dashboardStore.runState === "idle"}
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <IconInfoCircle size={16} stroke={1.5} />
          <span>{dashboardStore.hintText}</span>
        </div>
      {:else if dashboardStore.runState === "running"}
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <IconDatabase size={16} stroke={1.5} class="text-primary" />
          <span>{dashboardStore.hintText}</span>
        </div>
      {:else}
        <div
          class="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500"
        >
          <IconAlertTriangle size={16} stroke={1.5} />
          <span>{dashboardStore.hintText}</span>
        </div>
      {/if}
    </div>

    <button
      type="button"
      onclick={handleMainbutton}
      class={[
        "group relative flex size-44 items-center justify-center rounded-full border border-border/50 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        dashboardStore.runState === "idle" &&
          "bg-primary text-primary-foreground",
        dashboardStore.runState === "running" && "bg-card text-foreground",
        dashboardStore.runState === "terminating" &&
          "bg-destructive text-destructive-foreground",
      ]}
      aria-label={dashboardStore.buttonLabel}
    >
      {#if dashboardStore.runState === "running"}
        <span
          class="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping"
        ></span>
        <span class="absolute inset-2 rounded-full border border-primary/60"
        ></span>
      {/if}

      <div class="relative flex flex-col items-center gap-2">
        {#if dashboardStore.runState === "idle"}
          <IconPlayerPlayFilled size={48} stroke={1.5} />
        {:else if dashboardStore.runState === "running"}
          <IconPlayerStopFilled
            size={44}
            stroke={1.5}
            class="text-foreground"
          />
        {:else}
          <IconLoader2 size={44} stroke={1.5} class="animate-spin" />
        {/if}
        <span class="text-sm font-medium tracking-wide">
          {dashboardStore.buttonLabel}
        </span>
      </div>
    </button>

    {#if dashboardStore.runState === "terminating"}
      <div
        class="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/50 px-4 py-2 text-xs text-muted-foreground animate-fade-in"
      >
        <IconClock size={14} stroke={1.5} />
        <span>
          已等待
          <span class="font-mono text-foreground">
            {fmtTime(dashboardStore.terminatingSeconds)}
          </span>
          · 通常需要 30 秒以内
        </span>
      </div>
    {/if}
  </div>
</section>
