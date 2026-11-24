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

  const unavailable = $derived(info.available === false);
  const enabled = $derived(runtimeState.status !== "disabled" && !unavailable);

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

  const canExpand = $derived(enabled || unavailable);

  /**
   * 是否提供「测试一下」。
   *
   * 由服务端的 `testSnippet` 决定，而不是按 `kind` 判断：语言类与工具类
   * 运行时都各自提供了可执行的验证片段（aria2 为 `aria2c --version`），
   * 主进程 `testRuntime` 也已覆盖工具类（`executeTestCode` 直接跑
   * `aria2c --version`）。按 `kind` 写死会让已具备能力的 aria2 看不到入口。
   */
  const canTest = $derived(!unavailable && info.testSnippet.trim().length > 0);

  /**
   * 刚进入页面时所有工具详情默认收起，避免长列表首屏被详情占满；
   * 用户点击 Switch 时仍按原逻辑：启用即展开，禁用即收起。
   */
  let expanded = $state(false);

  let testing = $state(false);
  let testResult = $state<CodeRuntimeTestResult | null>(null);

  function handleCheckedChange(next: boolean): void {
    if (unavailable) return;
    expanded = next;
    // 启停会改变运行环境，上一次的测试结果不再有参考意义。
    testResult = null;
    onToggle(next);
  }

  function toggleExpanded(): void {
    expanded = !expanded;
  }

  async function runTest(): Promise<void> {
    if (testing || !canTest) return;
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

  /**
   * 结果条是单行展示：`aria2c --version` 这类命令会输出多行版本信息，
   * 直接内联会把结果条撑成一块。这里取首个非空行并截断，完整输出通过
   * 结果条自身的 title 呈现。
   */
  function formatTestOutput(raw: string): string {
    const maxLength = 80;
    const firstLine =
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? "";
    if (!firstLine) return "（无输出）";
    return firstLine.length > maxLength
      ? `${firstLine.slice(0, maxLength)}…`
      : firstLine;
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
        {:else if info.kind === "utility"}
          <span
            class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            下载加速
          </span>
        {/if}
      </div>
      <p class="truncate text-xs text-muted-foreground">{info.tagline}</p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      {#if unavailable}
        <span
          class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          即将支持
        </span>
      {:else if enabled}
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
      {/if}

      {#if canExpand}
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
        disabled={busy || unavailable}
        aria-label={unavailable
          ? `${info.name} 尚未支持`
          : `${enabled ? "停用" : "启用"} ${info.name}`}
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
      {#if unavailable}
        <div class="space-y-3 border-t border-border/40 px-5 pb-5 pt-4">
          <div
            class="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          >
            {info.name}
            的界面入口已预留。主进程接入下载工具后，可在这里启用多线程下载加速。
          </div>
        </div>
      {:else if enabled}
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
              {#if canTest}
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
                    title={testResult.output}
                  >
                    <span class="text-muted-foreground">{info.testSnippet}</span
                    >
                    <span>→ {formatTestOutput(testResult.output)}</span>
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
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
