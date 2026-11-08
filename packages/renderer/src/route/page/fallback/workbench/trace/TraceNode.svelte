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
  import Self from "./TraceNode.svelte";

  let { node, depth = 1 }: { node: TraceNode; depth?: number } = $props();

  // running 状态判定：streaming === false 时强制视作已终止
  let running = $derived(node.status === "running" && node.streaming !== false);
  let streaming = $derived(node.streaming === true);

  let traceStatus = $derived<"running" | "error" | "pending" | undefined>(
    node.status === "running"
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

  let userOpen = $state<boolean | undefined>(undefined);
  let open = $derived(userOpen ?? (streaming || running || hasDetail));
</script>

{#snippet leadingIcon()}
  {#if node.status === "running"}
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

{#if expandable}
  <Trace.Collapsible {open} onOpenChange={(v) => (userOpen = v)}>
    <Trace.CollapsibleTrigger>
      {@render line()}
    </Trace.CollapsibleTrigger>
    <Trace.CollapsibleContent
      class="whitespace-pre-wrap *:data-[slot=trace-collapsible-content-inner]:mt-1"
    >
      {#if hasDetail}
        <MarkdownView message={{ content: node.detail ?? "" }} {streaming} />
      {/if}
      {#if hasChildren}
        <div class:mt-2={hasDetail} class="flex flex-col gap-1">
          {#each children as child (child.id)}
            <Self node={child} depth={depth + 1} />
          {/each}
        </div>
      {/if}
    </Trace.CollapsibleContent>
  </Trace.Collapsible>
{:else if node.kind === "source"}
  <a href={node.url} target="_blank" rel="noreferrer">
    {@render line()}
  </a>
{:else}
  {@render line()}
{/if}
