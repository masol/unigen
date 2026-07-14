<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { dashboardStore } from "$lib/store/dashboard.svelte";
  import {
    IconLoader2,
    IconPlayerPlayFilled,
    IconPlayerStopFilled,
  } from "@tabler/icons-svelte";

  // ═══════════════════════════════════════════════════════════
  // 三态执行器 — idle(可运行) / running(停止中) / terminating(强制终止)
  // 只响应 dashboardStore.runState,点击直接交给 handleMainButton
  // ═══════════════════════════════════════════════════════════
  const runState = $derived(dashboardStore.runState);

  // "idle" | "running" | 其它一律视为「终止中」
  const phase = $derived.by<"idle" | "running" | "terminating">(() => {
    if (runState === "idle") return "idle";
    if (runState === "running") return "running";
    return "terminating";
  });

  const tip = $derived.by(() => {
    if (phase === "idle") return "运行";
    if (phase === "running") return "运行中…（点击停止）";
    return "强制终止中…";
  });

  async function handleClick() {
    // 不关心下一个状态,交给业务逻辑推进
    await dashboardStore.handleMainButton();
  }
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <!--
        固定尺寸盒子:ml-3 对齐原 Brand,size-5 与状态条(h-6)协调。
        overflow-hidden + 所有动画均为 transform/opacity/color,
        绝不改变盒模型 → 布局永不被撑开。
      -->
      <button
        {...props}
        id="run-status-control"
        onclick={handleClick}
        // title={tip}
        data-phase={phase}
        class="run-status group relative ml-3 flex size-5 shrink-0 items-center justify-center overflow-hidden rounded transition-colors duration-200"
        aria-label={tip}
      >
        <!-- 背景脉冲光环:运行/终止时可见,纯 transform+opacity,不占布局 -->
        {#if phase !== "idle"}
          <span class="pulse-ring" aria-hidden="true"></span>
        {/if}

        <!-- 图标层:绝对居中,尺寸恒定 -->
        <span class="icon-layer">
          {#if phase === "idle"}
            <IconPlayerPlayFilled
              class="size-3.5 text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
              stroke={1.5}
            />
          {:else if phase === "running"}
            <!-- 停止中:呼吸 + 轻微摆动,提示正在执行 -->
            <IconPlayerStopFilled
              class="stop-anim size-3.5 text-foreground"
              stroke={1.5}
            />
          {:else}
            <!-- 强制终止:红色高亮 + 旋转,紧急感 -->
            <IconLoader2
              class="size-3.5 animate-spin text-red-500"
              stroke={1.5}
            />
          {/if}
        </span>
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content class="z-200">{tip}</Tooltip.Content>
</Tooltip.Root>

<style>
  /* 图标层固定居中,任何动画都在此盒内进行 */
  .icon-layer {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

  /* ── running: 停止图标「呼吸 + 摆动」──────────────── */
  .stop-anim {
    transform-origin: center;
    animation: stop-breathe 1.4s ease-in-out infinite;
    will-change: transform, opacity;
  }
  @keyframes stop-breathe {
    0%,
    100% {
      transform: scale(0.9);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.08);
      opacity: 1;
    }
  }

  /* ── 背景脉冲光环 ──────────────────────────────────
     scale 只走 transform,盒子外由 overflow-hidden 裁掉,
     绝不影响布局尺寸。 */
  .pulse-ring {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 100%;
    height: 100%;
    border-radius: 9999px;
    background: currentColor;
    opacity: 0;
    transform: scale(0.4);
    will-change: transform, opacity;
  }

  /* running 光环:与前景色一致,柔和脉冲 */
  .run-status[data-phase="running"] .pulse-ring {
    color: var(--foreground, currentColor);
    animation: ring-pulse 1.4s ease-out infinite;
  }

  /* terminating 光环:红色,更快更急促 */
  .run-status[data-phase="terminating"] .pulse-ring {
    color: rgb(239 68 68); /* red-500 */
    animation: ring-pulse 0.9s ease-out infinite;
  }

  @keyframes ring-pulse {
    0% {
      opacity: 0.35;
      transform: scale(0.4);
    }
    70% {
      opacity: 0;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  /* terminating 时按钮底色也带一点红,增强紧急感(不改尺寸) */
  .run-status[data-phase="terminating"] {
    background-color: rgb(239 68 68 / 0.12);
  }

  /* 尊重「减少动态」偏好 */
  @media (prefers-reduced-motion: reduce) {
    .stop-anim,
    .pulse-ring,
    :global(.run-status .animate-spin) {
      animation: none !important;
    }
  }
</style>
