<script lang="ts">
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Button } from "$lib/components/ui/button";
  import { Switch } from "$lib/components/ui/switch";
  import { safeApi } from "$lib/utils/api";
  import type { TaskSnapshot } from "@app/main/types";
  import { IconCode } from "@tabler/icons-svelte";
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

  let testing = $state(false);
  let testResult = $state<CodeRuntimeTestResult | null>(null);

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

<div class="rounded-2xl border border-border/50 bg-card p-5 transition-colors">
  <div class="flex items-start gap-3">
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

    <div class="flex shrink-0 items-center gap-3">
      {#if enabled}
        <span
          class="rounded-md px-1.5 py-0.5 text-[10px] font-medium {STATUS_CLASS[
            displayStatus
          ]}"
        >
          {STATUS_LABEL[displayStatus]}{displayStatus === "ready" &&
          runtimeState.version
            ? ` · ${runtimeState.version}`
            : ""}
        </span>
      {/if}
      <Switch
        checked={enabled}
        onCheckedChange={(v) => onToggle(v)}
        disabled={busy}
        aria-label={`${enabled ? "停用" : "启用"} ${info.name}`}
      />
    </div>
  </div>

  {#if enabled}
    <div
      transition:fade={{ duration: 150 }}
      class="mt-3 space-y-3 border-t border-border/40 pt-3"
    >
      {#if displayStatus === "preparing"}
        <RuntimeProgress progress={displayProgress} message={displayMessage} />
        <p class="text-[11px] text-muted-foreground/80">
          首次启用需要下载 {info.approximateDownloadMB ?? "少量"} MB，请稍候。
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
        <p class="text-xs leading-relaxed text-muted-foreground">
          开启后 AI 能：{info.capability}
        </p>

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
                class={testResult.ok ? "text-emerald-600" : "text-destructive"}
              >
                {testResult.ok ? "✅" : "❌"}
              </span>
              <span class="text-muted-foreground/70">
                用时 {formatElapsed(testResult.elapsedMs)}
              </span>
            </div>
            {#if testResult.error && testResult.ok === false}
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
