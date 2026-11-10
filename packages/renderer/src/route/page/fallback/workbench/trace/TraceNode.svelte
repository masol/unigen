<!-- 单个 trace 节点 · 显示真实动态内容 -->
<script lang="ts" module>
  /**
   * 将 token 数格式化为紧凑形式：1234 → 1.2k，1234567 → 1.2M。
   * 放在 module 脚本中，避免递归组件每个实例重复定义。
   */
  function formatTokens(n?: number): string {
    if (!n) return "0";
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(n);
  }

  // ── Usage 安全解析 ────────────────────────────────────────
  // 服务端 usage 对齐 Vercel AI SDK 的 LanguageModelUsage：
  //   { inputTokens, outputTokens, totalTokens,
  //     inputTokenDetails:  { noCacheTokens, cacheReadTokens, cacheWriteTokens },
  //     outputTokenDetails: { textTokens, reasoningTokens } }
  // 旧历史数据可能残留顶层 reasoningTokens / cachedInputTokens，一并兼容。
  // 通过 unknown 窄化读取，不依赖 ModelUsage 类型是否已同步。
  type UsageBag = Record<string, unknown>;

  function asBag(v: unknown): UsageBag | undefined {
    return v !== null && typeof v === "object" ? (v as UsageBag) : undefined;
  }
  function num(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  }

  type UsageView = {
    input?: number;
    output?: number;
    total?: number;
    noCache?: number;
    cacheRead?: number;
    cacheWrite?: number;
    text?: number;
    reasoning?: number;
  };

  function readUsage(raw: unknown): UsageView | null {
    const u = asBag(raw);
    if (!u) return null;

    const input = num(u.inputTokens);
    const output = num(u.outputTokens);
    const total =
      num(u.totalTokens) ??
      (input != null && output != null ? input + output : (input ?? output));

    const inDet = asBag(u.inputTokenDetails);
    const outDet = asBag(u.outputTokenDetails);

    const view: UsageView = {
      input,
      output,
      total,
      noCache: num(inDet?.noCacheTokens),
      cacheRead: num(inDet?.cacheReadTokens) ?? num(u.cachedInputTokens),
      cacheWrite: num(inDet?.cacheWriteTokens),
      text: num(outDet?.textTokens),
      reasoning: num(outDet?.reasoningTokens) ?? num(u.reasoningTokens),
    };

    // 没有任何可展示字段时返回 null，避免空徽章/空面板
    const hasAny =
      view.total != null ||
      view.input != null ||
      view.output != null ||
      view.noCache != null ||
      view.cacheRead != null ||
      view.cacheWrite != null ||
      view.text != null ||
      view.reasoning != null;
    return hasAny ? view : null;
  }
</script>

<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Trace from "$lib/components/ui/trace";
  import { hasTraceChildren } from "$lib/store/local/chat.guards";
  import type { TraceNode } from "$lib/store/local/chat.types";
  import {
    IconAlertTriangle,
    IconArrowUpRight,
    IconBrain,
    IconCheck,
    IconCircleDashed,
    IconLink,
    IconLoader2,
    IconRobot,
    IconTool,
  } from "@tabler/icons-svelte";
  import { cubicOut } from "svelte/easing";
  import { slide } from "svelte/transition";
  import Self from "./TraceNode.svelte";

  let {
    node,
    depth = 1,
    autoExpand = false,
  }: {
    node: TraceNode;
    depth?: number;
    autoExpand?: boolean;
  } = $props();

  // streaming：后端是否仍在推送该节点。
  // streaming === false 时强制视作已终止——即使 node.status 残留 "running"，
  // 也不再视为运行中（否则中断后 spinner 会一直转、shimmer 一直闪）。
  let streaming = $derived(node.streaming === true);

  // isRunning：真实运行中 = 状态为 running 且后端仍在推送。
  let isRunning = $derived(node.status === "running" && streaming);

  let traceStatus = $derived<"running" | "error" | "pending" | undefined>(
    isRunning
      ? "running"
      : node.status === "error"
        ? "error"
        : node.status === "pending"
          ? "pending"
          : undefined,
  );

  let descriptionText = $derived(node.description);

  let hasDetail = $derived(
    node.detail !== undefined && node.detail !== null && node.detail.length > 0,
  );

  // 修复类型错误：直接在判断中使用守卫，避免 $derived 类型收窄失效
  let children = $derived.by(() => {
    if (!hasTraceChildren(node)) return [];
    return node.children;
  });

  let hasChildren = $derived(children.length > 0);

  let expandable = $derived(hasDetail || hasChildren);

  let showDepthBadge = $derived(depth >= 3);

  /**
   * 自动展开策略（主流 Agent 模式）：
   * - 默认折叠；
   * - 仅当外部允许自动展开（autoExpand === true，即消息处于思考阶段且尚未输出正文）
   *   且该节点有子节点时，才自动展开，以显示 trace 骨架；
   * - 子节点自身同样受 autoExpand 门控，但一旦消息开始输出正文或思考结束，
   *   autoExpand 变为 false，未被用户手动操作过的节点将全部收起；
   * - 用户显式操作（userOpen）优先于自动策略。
   */
  let userOpen = $state<boolean | undefined>(undefined);
  let autoOpen = $derived(autoExpand && hasChildren);
  let open = $derived(userOpen ?? autoOpen);

  // ── Usage（模型用量）──────────────────────────────────────
  // 协议：agent 节点结束时由 trace.end.patch.usage 下发；
  // 历史回放时由 TraceNode.usage 携带（服务端 traces.usage 列）。
  // 仅 agent 节点展示，避免工具/推理/步骤节点出现空占位。
  let usage = $derived(node.kind === "agent" ? readUsage(node.usage) : null);
</script>

{#snippet leadingIcon()}
  {#if isRunning}
    <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
  {:else if node.status === "error"}
    <IconAlertTriangle size={16} stroke={1.5} />
  {:else if node.status === "pending"}
    <IconCircleDashed size={16} stroke={1.5} />
  {:else if node.status === "success"}
    <IconCheck size={16} stroke={1.5} />
  {:else if node.kind === "agent"}
    <IconRobot size={16} stroke={1.5} />
  {:else if node.kind === "reasoning"}
    <IconBrain size={16} stroke={1.5} />
  {:else if node.kind === "tool"}
    <IconTool size={16} stroke={1.5} />
  {:else if node.kind === "source"}
    <IconLink size={16} stroke={1.5} />
  {:else if node.kind === "step" && node.icon}
    <RuntimeIcon name={node.icon} size={16} stroke={1.5} />
  {:else}
    <IconCircleDashed size={16} stroke={1.5} />
  {/if}
{/snippet}

{#snippet depthBadge()}
  <span
    class="ml-1 shrink-0 rounded-md border border-border/50 bg-muted/40 px-1.5 py-px font-mono text-xs text-muted-foreground"
    title={`嵌套层级 L${depth - 1}`}
  >
    L{depth - 1}
  </span>
{/snippet}

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → UsageBadge.svelte]                  │ -->
<!-- │ 职责：agent 行末的紧凑 token 徽章 + 悬停明细 Tooltip │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
{#snippet usageBadge(view: UsageView)}
  {#if view.total != null}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <!--
            用 span 而非 button 作 Trigger：本行在 expandable 时已被
            CollapsibleTrigger（button）包裹，禁止按钮嵌套。
            该徽章仅承载悬停/辅助描述，不承担键盘独立操作，
            故不加 tabindex，避免 button 内出现可聚焦子元素的 a11y 问题。
          -->
          <span
            {...props}
            class="ml-1 shrink-0 cursor-help rounded-md border border-border/50 bg-muted/30 px-1.5 py-px font-mono text-xs text-muted-foreground tabular-nums transition-colors hover:border-border hover:text-foreground"
          >
            {formatTokens(view.total)} tok
          </span>
        {/snippet}
      </Tooltip.Trigger>

      <Tooltip.Content
        side="top"
        align="end"
        sideOffset={6}
        class="w-60 rounded-xl border border-border/50 bg-popover p-0 text-popover-foreground shadow-xl"
      >
        <div class="space-y-2 p-3">
          <div class="flex items-center justify-between gap-4">
            <span class="text-xs font-medium text-foreground">模型用量</span>
            {#if view.total != null}
              <span
                class="font-mono text-xs font-medium tabular-nums text-foreground"
              >
                {view.total.toLocaleString()} tok
              </span>
            {/if}
          </div>

          <div class="h-px bg-border/50"></div>

          {#if view.input != null || view.noCache != null || view.cacheRead != null || view.cacheWrite != null}
            <div class="space-y-1">
              {#if view.input != null}
                <div class="flex items-center justify-between gap-4 text-xs">
                  <span class="text-muted-foreground">输入</span>
                  <span class="font-mono tabular-nums text-foreground">
                    {view.input.toLocaleString()}
                  </span>
                </div>
              {/if}
              {#if view.noCache != null}
                <div
                  class="flex items-center justify-between gap-4 pl-3 text-xs"
                >
                  <span class="text-muted-foreground/80">无缓存</span>
                  <span class="font-mono tabular-nums text-muted-foreground">
                    {view.noCache.toLocaleString()}
                  </span>
                </div>
              {/if}
              {#if view.cacheRead != null}
                <div
                  class="flex items-center justify-between gap-4 pl-3 text-xs"
                >
                  <span class="text-muted-foreground/80">缓存读取</span>
                  <span class="font-mono tabular-nums text-muted-foreground">
                    {view.cacheRead.toLocaleString()}
                  </span>
                </div>
              {/if}
              {#if view.cacheWrite != null}
                <div
                  class="flex items-center justify-between gap-4 pl-3 text-xs"
                >
                  <span class="text-muted-foreground/80">缓存写入</span>
                  <span class="font-mono tabular-nums text-muted-foreground">
                    {view.cacheWrite.toLocaleString()}
                  </span>
                </div>
              {/if}
            </div>
          {/if}

          {#if view.output != null || view.text != null || view.reasoning != null}
            <div class="space-y-1">
              {#if view.output != null}
                <div class="flex items-center justify-between gap-4 text-xs">
                  <span class="text-muted-foreground">输出</span>
                  <span class="font-mono tabular-nums text-foreground">
                    {view.output.toLocaleString()}
                  </span>
                </div>
              {/if}
              {#if view.text != null}
                <div
                  class="flex items-center justify-between gap-4 pl-3 text-xs"
                >
                  <span class="text-muted-foreground/80">正文</span>
                  <span class="font-mono tabular-nums text-muted-foreground">
                    {view.text.toLocaleString()}
                  </span>
                </div>
              {/if}
              {#if view.reasoning != null}
                <div
                  class="flex items-center justify-between gap-4 pl-3 text-xs"
                >
                  <span class="text-muted-foreground/80">推理</span>
                  <span class="font-mono tabular-nums text-muted-foreground">
                    {view.reasoning.toLocaleString()}
                  </span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </Tooltip.Content>
    </Tooltip.Root>
  {/if}
{/snippet}
<!-- ╭─── / UsageBadge ───╮ -->

{#snippet line()}
  <Trace.Line status={traceStatus}>
    <Trace.Icon>
      {@render leadingIcon()}
    </Trace.Icon>
    <Trace.Title>{node.title}</Trace.Title>

    {#if node.kind === "agent"}
      <Trace.Description>
        <span>{node.agent.name}</span>
        {#if node.agent.model}
          <span class="mx-1 text-border">·</span>
          <span class="font-mono">{node.agent.model}</span>
        {/if}
        {#if descriptionText}
          <span class="mx-1 text-border">·</span>
          <span>{descriptionText}</span>
        {/if}
      </Trace.Description>
      {#if usage}
        {@render usageBadge(usage)}
      {/if}
    {:else if descriptionText}
      <Trace.Description>{descriptionText}</Trace.Description>
    {/if}

    {#if showDepthBadge}
      {@render depthBadge()}
    {/if}

    {#if node.kind === "source"}
      <Trace.Icon>
        <IconArrowUpRight size={14} stroke={1.5} />
      </Trace.Icon>
    {/if}
  </Trace.Line>
{/snippet}

{#snippet detailContent()}
  {#if hasDetail}
    <div class="mt-1">
      <MarkdownView message={{ content: node.detail ?? "" }} {streaming} />
    </div>
  {/if}
  {#if hasChildren}
    <div
      class:mt-2={hasDetail}
      class:mt-1={!hasDetail}
      class="flex flex-col gap-1"
    >
      {#each children as child (child.id)}
        <Self node={child} depth={depth + 1} {autoExpand} />
      {/each}
    </div>
  {/if}
{/snippet}

{#if expandable}
  <Trace.Collapsible {open} onOpenChange={(v) => (userOpen = v)}>
    <Trace.CollapsibleTrigger>
      {@render line()}
    </Trace.CollapsibleTrigger>
    {#if open}
      <!--
        保持原生 slide 的开合行为（原代码选择绕开 bits-ui 的 height 动画，
        这里不改变这一决策）；仅在外层承载 overflow-hidden 以裁剪动画，
        内层复刻 trace-collapsible-content 的竖线布局：
        - ml-[calc(--spacing(2)_-_1px)]：竖线落在 trigger 图标中心正下方
        - pl-4 / pr-1：内容与竖线之间保持呼吸感
        - mt-2.5 / mb-1：与 trigger 之间、与下一个兄弟节点之间留白
      -->
      <div
        class="overflow-hidden"
        transition:slide={{ duration: 200, easing: cubicOut }}
      >
        <div
          class="ml-[calc(--spacing(2)-1px)] mt-2.5 mb-1 min-w-0 border-l pr-1 pl-4 leading-relaxed wrap-break-word text-muted-foreground"
        >
          {@render detailContent()}
        </div>
      </div>
    {/if}
  </Trace.Collapsible>
{:else if node.kind === "source"}
  <a href={node.url} target="_blank" rel="noreferrer">
    {@render line()}
  </a>
{:else}
  {@render line()}
{/if}
