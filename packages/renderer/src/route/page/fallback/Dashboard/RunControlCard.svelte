<!-- NovelToVideoDashboard/RunControlCard.svelte -->
<!-- 职责：核心运行按钮 + 动态提示文案。点击调用 store 方法。 -->
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
  } from "@tabler/icons-svelte";
  import { dashboardStore } from "./dashboard.svelte";

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
</script>

<section
  class="relative overflow-hidden rounded-3xl border border-border/50 bg-card p-8 shadow-sm lg:p-12"
>
  <div
    class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--color-primary),transparent_60%)]/8"
  ></div>

  <div class="relative flex flex-col items-center gap-6 text-center">
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
      onclick={() => dashboardStore.handleMainButton()}
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
        <span class="text-sm font-medium tracking-wide"
          >{dashboardStore.buttonLabel}</span
        >
      </div>
    </button>

    {#if dashboardStore.runState === "terminating"}
      <div
        class="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/50 px-4 py-2 text-xs text-muted-foreground animate-fade-in"
      >
        <IconClock size={14} stroke={1.5} />
        <span
          >已等待 <span class="font-mono text-foreground"
            >{fmtTime(dashboardStore.terminatingSeconds)}</span
          > · 通常需要 30 秒以内</span
        >
      </div>
    {/if}
  </div>
</section>
