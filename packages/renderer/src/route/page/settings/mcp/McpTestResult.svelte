<!--
  MCP 连接测试结果展示组件。

  设计原则：
  - Status-first：连接状态 / 延迟 / 协议 / 服务身份永远第一屏可见；
  - Progressive Disclosure：工具/资源/提示详情默认收起，按需展开；
  - Scroll Composition：详情展开不引入内部滚动，交由外层主滚动条统一控制；
  - Latency as Signal：<1000ms 中性提示，≥1000ms 黄色警告。

  复用位置：MCPServerCard、MCPServerConfigDialog（Step 2）。
-->
<script lang="ts">
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import type { McpConnectionTestResult } from "@app/main/types";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertCircle,
    IconAlertTriangle,
    IconCheck,
    IconChevronDown,
    IconDatabase,
    IconMessage,
    IconTool,
  } from "@tabler/icons-svelte";

  type TestState = "idle" | "loading" | "success" | "error";

  let {
    testState = "idle",
    result = null,
    error = "",
    stale = false,
  }: {
    /** 当前测试状态；idle 时不渲染任何内容。 */
    testState?: TestState;
    /** 成功时的测试结果快照。 */
    result?: McpConnectionTestResult | null;
    /** 失败时的错误信息。 */
    error?: string;
    /** 结果已过期（配置在测试后发生变更）。 */
    stale?: boolean;
  } = $props();

  /** 延迟超过此阈值视为"较慢"，以黄色警告提示。 */
  const SLOW_LATENCY_MS = 1000;

  const tools = $derived(result?.tools ?? []);
  const resources = $derived(result?.resources ?? []);
  const prompts = $derived(result?.prompts ?? []);
  const latencyMs = $derived(result?.latencyMs ?? 0);
  const isSlow = $derived(latencyMs >= SLOW_LATENCY_MS);
  const hasDetails = $derived(
    tools.length + resources.length + prompts.length > 0,
  );

  let detailsOpen = $state(false);
</script>

<div class="space-y-3" use:autoAnimate>
  {#if testState === "loading"}
    <div class="space-y-3 rounded-xl border border-border/50 bg-background p-4">
      <div class="flex items-center gap-3">
        <Skeleton class="size-7 rounded-lg" />
        <Skeleton class="h-4 w-24 rounded-lg" />
        <Skeleton class="h-4 w-16 rounded-lg" />
      </div>
      <Skeleton class="h-3 w-48 rounded-lg" />
      <Skeleton class="h-3 w-64 rounded-lg" />
    </div>
  {:else if testState === "error"}
    <div class="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      <div class="flex items-start gap-3">
        <div
          class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10"
        >
          <IconAlertCircle size={16} stroke={1.5} class="text-destructive" />
        </div>
        <div class="min-w-0 space-y-1">
          <p class="text-sm font-medium text-destructive">连接失败</p>
          <p class="break-all text-xs text-muted-foreground">
            {error || "连接失败，请检查连接参数"}
          </p>
        </div>
      </div>
    </div>
  {:else if testState === "success" && result?.ok}
    <div class="rounded-xl border border-border/50 bg-background">
      <!-- ══════ 汇总头部（常驻） ══════ -->
      <div class="space-y-3 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            <IconCheck size={12} stroke={1.5} />
            连接成功
          </span>

          {#if isSlow}
            <span
              class="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
              title="延迟较高，可能影响调用体验"
            >
              <IconAlertTriangle size={12} stroke={1.5} />
              延迟较高 · {latencyMs} ms
            </span>
          {:else}
            <span
              class="rounded-lg bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
            >
              延迟 {latencyMs} ms
            </span>
          {/if}

          {#if result.protocolVersion}
            <span class="text-xs text-muted-foreground">
              协议 {result.protocolVersion}
            </span>
          {/if}
        </div>

        {#if result.serverInfo}
          <p class="text-xs text-muted-foreground">
            {result.serverInfo.name} · v{result.serverInfo.version}
          </p>
        {/if}

        {#if hasDetails}
          <div
            class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
          >
            {#if tools.length > 0}
              <span class="flex items-center gap-1">
                <IconTool size={12} stroke={1.5} />
                {tools.length} 个工具
              </span>
            {/if}
            {#if resources.length > 0}
              <span class="flex items-center gap-1">
                <IconDatabase size={12} stroke={1.5} />
                {resources.length} 个资源
              </span>
            {/if}
            {#if prompts.length > 0}
              <span class="flex items-center gap-1">
                <IconMessage size={12} stroke={1.5} />
                {prompts.length} 个提示
              </span>
            {/if}
          </div>
        {/if}

        {#if stale}
          <p
            class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
          >
            <IconAlertTriangle size={12} stroke={1.5} />
            配置已变更，需重新测试
          </p>
        {/if}
      </div>

      <!-- ══════ 详情折叠面板（默认收起） ══════ -->
      {#if hasDetails}
        <Separator />
        <Collapsible.Root bind:open={detailsOpen}>
          <Collapsible.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground transition-all duration-200 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 active:bg-muted/70"
              >
                <span>{detailsOpen ? "收起详情" : "查看详情"}</span>
                <IconChevronDown
                  size={14}
                  stroke={1.5}
                  class={detailsOpen
                    ? "rotate-180 transition-transform duration-200"
                    : "transition-transform duration-200"}
                />
              </button>
            {/snippet}
          </Collapsible.Trigger>

          <Collapsible.Content>
            <div class="space-y-4 px-4 pb-4">
              {#if tools.length > 0}
                <div class="space-y-2">
                  <p
                    class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <IconTool size={12} stroke={1.5} />
                    工具 · {tools.length}
                  </p>
                  <div class="space-y-1.5">
                    {#each tools as tool (tool.name)}
                      <div
                        class="rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                      >
                        <p class="truncate font-mono text-xs font-medium">
                          {tool.name}
                        </p>
                        {#if tool.description}
                          <p class="mt-0.5 text-xs text-muted-foreground">
                            {tool.description}
                          </p>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if resources.length > 0}
                <div class="space-y-2">
                  <p
                    class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <IconDatabase size={12} stroke={1.5} />
                    资源 · {resources.length}
                  </p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each resources as resource (resource.uri)}
                      <span
                        class="rounded-lg bg-muted/30 px-2 py-0.5 font-mono text-xs text-muted-foreground"
                      >
                        {resource.uri}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if prompts.length > 0}
                <div class="space-y-2">
                  <p
                    class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <IconMessage size={12} stroke={1.5} />
                    提示模板 · {prompts.length}
                  </p>
                  <div class="flex flex-wrap gap-1.5">
                    {#each prompts as prompt (prompt.name)}
                      <span
                        class="rounded-lg bg-muted/30 px-2 py-0.5 font-mono text-xs text-muted-foreground"
                      >
                        {prompt.name}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      {/if}
    </div>
  {/if}
</div>
