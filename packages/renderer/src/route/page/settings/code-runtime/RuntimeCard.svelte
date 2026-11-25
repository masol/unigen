<!-- packages/renderer/src/route/page/settings/code-runtime/RuntimeCard.svelte -->
<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { safeApi } from "$lib/utils/api";
  import type { TaskSnapshot } from "@app/main/types";
  import {
    IconCheck,
    IconChevronDown,
    IconCode,
    IconX,
  } from "@tabler/icons-svelte";
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

  // svelte-ignore state_referenced_locally
  const detailId = `code-runtime-detail-${info.id}`;

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
   * 运行时都各自提供了可执行的验证片段（aria2 为 `aria2c --version`，
   * ffmpeg 为 `ffmpeg -version`），主进程 `testRuntime` 也已覆盖工具类
   * （见 `executeTestCode` 的 `UTILITY_VERSION_ARGV`）。按 `kind` 写死会让
   * 已具备能力的工具类看不到入口。
   */
  const canTest = $derived(!unavailable && info.testSnippet.trim().length > 0);

  /**
   * 状态胶囊拆成两段：状态文字恒定、不参与截断；版本号单独截断。
   * 版本号来自服务端，长度不可控（例如附带构建号 / 提交哈希），必须
   * 在胶囊内部消化，否则会把右侧开关挤出卡片。
   */
  const statusText = $derived(
    displayStatus === "preparing" && displayProgress > 0
      ? `${STATUS_LABEL[displayStatus]} ${displayProgress}%`
      : STATUS_LABEL[displayStatus],
  );

  const versionText = $derived(
    displayStatus === "ready" ? (runtimeState.version?.trim() ?? "") : "",
  );

  const statusTitle = $derived(
    versionText ? `${statusText} · ${versionText}` : statusText,
  );

  const errorText = $derived(runtimeState.error?.trim() || "未知错误");

  /**
   * 刚进入页面时所有工具详情默认收起，避免长列表首屏被详情占满；
   * 用户点击 Switch 时仍按原逻辑：启用即展开，禁用即收起。
   */
  let expanded = $state(false);

  let testing = $state(false);
  let testResult = $state<CodeRuntimeTestResult | null>(null);

  /**
   * 启停一律放行：主进程的 `disableEngine` 会通过 AbortSignal 中断进行中
   * 的安装（见 manager.ts），因此不再需要在“安装中不允许停用”上做 UI
   * 拦截。`busy`（API pending）仍然禁用按钮，避免双击产生并发请求。
   */
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
   * 结果条是单行展示：`aria2c --version` / `ffmpeg -version` 这类命令会
   * 输出多行版本信息，直接内联会把结果条撑成一块。这里只取首个非空行，
   * 超长部分交给 CSS 省略号；完整内容通过结果条自身的 title 呈现，
   * 因此不再在 JS 里重复做定长截断。
   */
  function formatTestOutput(raw: string): string {
    const firstLine =
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? "";
    return firstLine || "（无输出）";
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

  <div class="flex items-center gap-2 p-5">
    <!--
      展开/收起的热区覆盖「图标 + 标题 + 标签 + 描述 + 箭头」整块中间区域：
      - 箭头跟着热区落在中间，而不是贴在最右侧；
      - 开关保持独立控件，不嵌进按钮，避免交互语义冲突与误触；
      - 不可展开的条目（未启用且可用的工具）退回普通 div，不出现点了没反应的假按钮。
    -->
    <svelte:element
      this={canExpand ? "button" : "div"}
      type={canExpand ? "button" : undefined}
      role={canExpand ? undefined : "button"}
      class="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left {canExpand
        ? 'transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
        : ''}"
      onclick={canExpand ? toggleExpanded : undefined}
      aria-expanded={canExpand ? expanded : undefined}
      aria-controls={canExpand ? detailId : undefined}
      aria-label={canExpand
        ? `${expanded ? "收起" : "展开"} ${info.name} 详情`
        : undefined}
    >
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
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <p
            class="min-w-0 max-w-full truncate text-sm font-semibold text-foreground"
            title={info.name}
          >
            {info.name}
          </p>
          <!--
            标签优先用服务器下发的 `badge`：同一 kind 下的语义差异（aria2 是
            下载、ffmpeg 是音视频）无法由粗粒度 kind 表达。`sandbox` 是唯一的
            结构性分类，保留本地文案。badge 文案同样来自服务端，需要截断。
          -->
          {#if info.kind === "sandbox"}
            <span
              class="shrink-0 whitespace-nowrap rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              隔离模式
            </span>
          {:else if info.badge}
            <span
              class="max-w-32 truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={info.badge}
            >
              {info.badge}
            </span>
          {/if}
        </div>
        <p class="truncate text-xs text-muted-foreground" title={info.tagline}>
          {info.tagline}
        </p>
      </div>

      {#if canExpand}
        <IconChevronDown
          class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 {expanded
            ? 'rotate-180'
            : ''}"
        />
      {/if}
    </svelte:element>

    <!--
      右侧簇允许收缩：胶囊内版本号可截断到 0，状态文字与开关不可压缩，
      因此在窄窗口下也不会把内容顶出卡片。
    -->
    <div class="flex min-w-0 items-center gap-2">
      {#if unavailable}
        <span
          class="shrink-0 whitespace-nowrap rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          即将支持
        </span>
      {:else if enabled}
        <span
          class="inline-flex min-w-0 max-w-36 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium {STATUS_CLASS[
            displayStatus
          ]}"
          title={statusTitle}
        >
          <span class="shrink-0 whitespace-nowrap">{statusText}</span>
          {#if versionText}
            <span class="min-w-0 truncate font-mono tabular-nums opacity-80"
              >· {versionText}</span
            >
          {/if}
        </span>
      {/if}

      <div class="shrink-0">
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
  </div>

  <!--
    详情区：始终渲染于 DOM，通过 grid-template-rows 平滑展开/收起；
    折叠时同时 aria-hidden + inert，避免 Tab 焦点落到被裁剪的不可见按钮上。
  -->
  <div
    id={detailId}
    class="grid transition-[grid-template-rows] duration-200 ease-out {expanded
      ? 'grid-rows-[1fr]'
      : 'grid-rows-[0fr]'}"
    aria-hidden={!expanded}
    inert={!expanded}
  >
    <div class="min-h-0 overflow-hidden">
      {#if unavailable}
        <div class="space-y-3 border-t border-border/40 px-5 pb-5 pt-4">
          <div
            class="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground wrap-anywhere"
          >
            {info.name}
            的界面入口已预留。主进程接入该工具后，可在这里启用。
          </div>
        </div>
      {:else if enabled}
        <div class="space-y-3 border-t border-border/40 px-5 pb-5 pt-4">
          {#if displayStatus === "preparing"}
            <RuntimeProgress
              progress={displayProgress}
              message={displayMessage}
            />
            <p class="text-[11px] leading-relaxed text-muted-foreground/80">
              首次启用需要下载约 {info.approximateDownloadMB ?? "少量"} MB，请稍候。
              安装过程中随时可以关闭开关取消。
            </p>
          {:else if displayStatus === "failed"}
            <div
              class="space-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <p class="font-medium">启动失败</p>
              <!-- 失败原因可能是多行长报错：截断到 3 行，完整内容走 title -->
              <p
                class="line-clamp-3 leading-relaxed wrap-anywhere"
                title={errorText}
              >
                {errorText}
              </p>
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
            {#if canTest}
              <div class="space-y-2">
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
                  <!--
                    单行结果条：命令、输出各自截断，耗时与状态图标固定宽度。
                    命令最多占 45%，输出吃掉剩余空间并省略，因此无论输出多长
                    都不会换行、不会撑开卡片。
                  -->
                  <div
                    transition:fade={{ duration: 150 }}
                    class="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]"
                    title={`${info.testSnippet} → ${formatTestOutput(
                      testResult.output,
                    )}`}
                  >
                    <span
                      class="max-w-[45%] shrink-0 truncate text-muted-foreground"
                    >
                      {info.testSnippet}
                    </span>
                    <span class="shrink-0 text-muted-foreground/60">→</span>
                    <span class="min-w-0 flex-1 truncate">
                      {formatTestOutput(testResult.output)}
                    </span>
                    <span class="sr-only">
                      {testResult.ok ? "测试通过" : "测试失败"}
                    </span>
                    {#if testResult.ok}
                      <IconCheck
                        class="size-3.5 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                    {:else}
                      <IconX
                        class="size-3.5 shrink-0 text-destructive"
                        aria-hidden="true"
                      />
                    {/if}
                    <span
                      class="shrink-0 whitespace-nowrap text-muted-foreground/70"
                    >
                      用时 {formatElapsed(testResult.elapsedMs)}
                    </span>
                  </div>

                  {#if testResult.error && !testResult.ok}
                    <p
                      class="line-clamp-2 text-[11px] leading-relaxed text-destructive wrap-anywhere"
                      title={testResult.error}
                    >
                      {testResult.error}
                    </p>
                  {/if}
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
