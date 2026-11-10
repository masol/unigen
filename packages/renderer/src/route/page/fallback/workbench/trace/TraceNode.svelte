<!-- 单个 trace 节点 · 显示真实动态内容 -->
<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { RuntimeIcon } from "$lib/components/runtimeicon";
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
