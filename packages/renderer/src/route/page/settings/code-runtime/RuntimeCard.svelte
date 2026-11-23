<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { safeApi } from "$lib/utils/api";
  import type { TaskSnapshot } from "@app/main/types";
  import { IconChevronDown, IconCode } from "@tabler/icons-svelte";
  import { fade } from "svelte/transition";
  import { STATUS_CLASS, STATUS_LABEL } from "./constants";
  import RuntimeProgress from "./RuntimeProgress.svelte";
  import type {
    CodeRuntimeInfo,
    CodeRuntimeState,
    CodeRuntimeStatus,
    CodeRuntimeTestResult,
  } from "./types";

  type Props = {
    info: CodeRuntimeInfo;
    /**
     * 注意命名：不能叫 `state` —— Svelte 5 会把 `$state` 与本地绑定冲突，
     * 编译期会把它当 store 订阅，运行时报 store_invalid_shape。
     */
    runtimeState: CodeRuntimeState;
    /** 主进程推送的安装任务快照；存在时优先展示其进度。 */
    task?: TaskSnapshot;
    /** 禁用中/安装中 → 禁用按钮，避免重复触发。 */
    busy?: boolean;
    onToggle: (enabled: boolean) => void;
  };
  let { info, runtimeState, task, busy = false, onToggle }: Props = $props();

  const enabled = $derived(runtimeState.status !== "disabled");

  const taskRunning = $derived(
    task?.status === "running" || task?.status === "pending",
  );

  const displayStatus = $derived(
    (taskRunning ? "preparing" : runtimeState.status) as CodeRuntimeStatus,
  );

  const displayProgress = $derived(
    taskRunning
      ? Math.round(task?.progress ?? 0)
      : (runtimeState.progress ?? 0),
  );

  const displayMessage = $derived(
    taskRunning ? (task?.message ?? "准备中…") : runtimeState.message,
  );

  /**
   * 详情区展开状态：
   * - 初始：disabled 时收起，其它状态展开；
   * - 用户点击 Switch 时：启用 → 自动展开；禁用 → 自动收起；
   * - 其它时间完全由用户通过 header 中的展开/收起按钮控制。
   *   （不随 status 变化，避免安装中途被强行展开打断用户的阅读位置）
   */
  let expanded = $state(runtimeState.status !== "disabled");

  let testing = $state(false);
  let testResult = $state<CodeRuntimeTestResult | null>(null);

  function handleCheckedChange(next: boolean): void {
    expanded = next;
    onToggle(next);
  }

  function toggleExpanded(): void {
    expanded = !expanded;
  }

  async function runTest(): Promise<void> {
    if (testing) return;
    testing = true;
    testResult = null;
    try {
      const result = await safeApi().code.testRuntime({
        id: info.id,
        code: info.testSnippet,
      });
      testResult = result;
    } finally {
      testing = false;
    }
  }

  function formatElapsed(ms: number): string {
    return ms < 1000 ? `${ms} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`;
  }
</script>

<!--
  收缩时长度稳定：使用 grid-template-rows 0fr↔1fr 的纯 CSS 过渡，
  内容始终存在于 DOM，避免 Svelte transition 在 mount/unmount 时的测量抖动，
  也避免内容突变引起的卡片高度跳变。
-->
<div
  class="relative overflow-hidden rounded-2xl border border-border/50 bg-card transition-colors"
>
  <!-- 收起状态下的安装进度：顶部细线，不占用任何布局高度 -->
  {#if taskRunning && !expanded}
    <div
      class="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-muted/60"
      aria-hidden="true"
    >
      <div
        class="h-full bg-primary transition-[width] duration-500 ease-out"
        style="width: {displayProgress}%"
      ></div>
    </div>
  {/if}

  <div class="flex items-start gap-3 p-5">
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
    >
      {#if info.icon}
        <RuntimeIcon name={info.icon} size={20} />
      {:else}
        <IconCode class="size-5" />
      {/if}
    </span>

    <div class="min-w-0 flex-1 space-y-0.5">
      <div class="flex flex-wrap items-center gap-2">
        <p class="truncate text-sm font-semibold text-foreground">
          {info.name}
        </p>
        {#if info.kind === "sandbox"}
          <span
            class="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
          >
            隔离模式
          </span>
        {/if}
      </div>
      <p class="truncate text-xs text-muted-foreground">{info.tagline}</p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      {#if enabled}
        <span
          class="rounded-md px-1.5 py-0.5 text-[10px] font-medium {STATUS_CLASS[
            displayStatus
          ]}"
        >
          {STATUS_LABEL[displayStatus]}{displayStatus === "preparing" &&
          displayProgress > 0
            ? ` ${displayProgress}%`
            : ""}{displayStatus === "ready" && runtimeState.version
            ? ` · ${runtimeState.version}`
            : ""}
        </span>

        <button
          type="button"
          onclick={toggleExpanded}
          class="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={expanded ? "收起详情" : "展开详情"}
          aria-expanded={expanded}
        >
          <IconChevronDown
            class="size-4 transition-transform duration-200 {expanded
              ? 'rotate-180'
              : ''}"
          />
        </button>
      {/if}

      <Switch
        checked={enabled}
        onCheckedChange={handleCheckedChange}
        disabled={busy}
        aria-label={`${enabled ? "停用" : "启用"} ${info.name}`}
      />
    </div>
  </div>

  <!-- 详情区：始终渲染于 DOM，通过 grid-template-rows 平滑展开/收起 -->
  <div
    class="grid transition-[grid-template-rows] duration-200 ease-out {expanded
      ? 'grid-rows-[1fr]'
      : 'grid-rows-[0fr]'}"
    aria-hidden={!expanded}
  >
    <div class="min-h-0 overflow-hidden">
      {#if enabled}
        <div class="space-y-3 border-t border-border/40 px-5 pb-5 pt-4">
          {#if displayStatus === "preparing"}
            <RuntimeProgress
              progress={displayProgress}
              message={displayMessage}
            />
            <p class="text-[11px] text-muted-foreground/80">
              首次启用需要下载约 {info.approximateDownloadMB ?? "少量"} MB，请稍候。
            </p>
          {:else if displayStatus === "failed"}
            <div
              class="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              启动失败：{runtimeState.error ?? "未知错误"}
            </div>
            <Button
              variant="outline"
              size="sm"
              class="rounded-lg"
              onclick={() => onToggle(true)}
              disabled={busy}
            >
              重新安装
            </Button>
          {:else if displayStatus === "ready"}
            <div class="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                class="rounded-lg"
                onclick={() => void runTest()}
                disabled={testing}
              >
                {testing ? "测试中…" : "测试一下"}
              </Button>

              {#if testResult}
                <div
                  transition:fade={{ duration: 150 }}
                  class="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]"
                >
                  <span class="text-muted-foreground">{info.testSnippet}</span>
                  <span>→ {testResult.output}</span>
                  <span
                    class={testResult.ok
                      ? "text-emerald-600"
                      : "text-destructive"}
                  >
                    {testResult.ok ? "✅" : "❌"}
                  </span>
                  <span class="text-muted-foreground/70">
                    用时 {formatElapsed(testResult.elapsedMs)}
                  </span>
                </div>
                {#if testResult.error && !testResult.ok}
                  <div class="text-[11px] text-destructive">
                    {testResult.error}
                  </div>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
