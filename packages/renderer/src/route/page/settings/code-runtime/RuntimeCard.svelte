<script lang="ts">
  import { RuntimeIcon } from '$lib/components/runtimeicon';
  import ToggleRow from '$lib/components/toggle-row/ToggleRow.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { IconCode, IconLoader2 } from '@tabler/icons-svelte';
  import { fade } from 'svelte/transition';
  import { STATUS_CLASS, STATUS_LABEL } from './constants';
  import RuntimeProgress from './RuntimeProgress.svelte';
  import { codeRuntimeStore } from './store.svelte';
  import type {
    CodeRuntimeInfo,
    CodeRuntimeState,
    CodeRuntimeTestResult,
  } from './types';

  type Props = {
    info: CodeRuntimeInfo;
    /**
     * 注意命名：不能叫 `state` —— Svelte 5 会把 `$state` 与本地绑定冲突，
     * 编译期会把它当 store 订阅，运行时报 store_invalid_shape。
     */
    runtimeState: CodeRuntimeState;
  };
  let { info, runtimeState }: Props = $props();

  const enabled = $derived(runtimeState.status !== 'disabled');
  const showAdvanced = $derived(
    runtimeState.status === 'ready' &&
      (info.advancedOptions?.length ?? 0) > 0,
  );

  let testing = $state(false);
  let testResult = $state<CodeRuntimeTestResult | null>(null);

  async function runTest() {
    if (!info.testSnippet) return;
    testing = true;
    testResult = null;
    try {
      testResult = await codeRuntimeStore.test(info.id, info.testSnippet);
    } finally {
      testing = false;
    }
  }

  function formatElapsed(ms: number): string {
    return ms < 1000 ? `${ms} 毫秒` : `${(ms / 1000).toFixed(1)} 秒`;
  }
</script>

<div
  class="rounded-2xl border border-border/50 bg-card p-5 transition-colors"
>
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
        {#if info.kind === 'sandbox'}
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
            runtimeState.status
          ]}"
        >
          {STATUS_LABEL[runtimeState.status]}{runtimeState.version
            ? ` · ${runtimeState.version}`
            : ''}
        </span>
      {/if}
      <Switch
        checked={enabled}
        onCheckedChange={(v) => codeRuntimeStore.setEnabled(info.id, v)}
        aria-label={`启用 ${info.name}`}
      />
    </div>
  </div>

  {#if enabled}
    <div
      transition:fade={{ duration: 150 }}
      class="mt-3 space-y-3 border-t border-border/40 pt-3"
    >
      {#if runtimeState.status === 'preparing'}
        <RuntimeProgress
          progress={runtimeState.progress ?? 0}
          message={runtimeState.message}
        />
        <p class="text-[11px] text-muted-foreground/80">
          首次启用需要下载 {info.approximateDownloadMB ?? '少量'} MB，请稍候。
        </p>
      {:else if runtimeState.status === 'failed'}
        <div
          class="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          启动失败：{runtimeState.error ?? '未知错误'}
        </div>
        <Button
          variant="outline"
          size="sm"
          class="rounded-lg"
          onclick={() => codeRuntimeStore.setEnabled(info.id, true)}
        >
          <IconLoader2 class="size-3.5" />
          重新安装
        </Button>
      {:else if runtimeState.status === 'ready'}
        <p class="text-xs leading-relaxed text-muted-foreground">
          开启后 AI 能：{info.capability}
        </p>

        {#if info.testSnippet}
          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="rounded-lg"
              onclick={runTest}
              disabled={testing}
            >
              {testing ? '测试中…' : '测试一下'}
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
                    ? 'text-emerald-600'
                    : 'text-destructive'}
                >
                  {testResult.ok ? '✅' : '❌'}
                </span>
                <span class="text-muted-foreground/70">
                  用时 {formatElapsed(testResult.elapsedMs)}
                </span>
              </div>
            {/if}
          </div>
        {/if}

        {#if showAdvanced}
          <div class="space-y-2 rounded-xl bg-muted/30 p-3">
            <p class="text-[11px] font-medium text-muted-foreground">
              高级 · 仅在了解风险时开启
            </p>
            {#each info.advancedOptions ?? [] as opt (opt.key)}
              <ToggleRow
                label={opt.label}
                description={opt.description}
                checked={runtimeState.options?.[opt.key] ?? false}
                onChange={(v) =>
                  codeRuntimeStore.setOption(info.id, opt.key, v)}
              />
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>