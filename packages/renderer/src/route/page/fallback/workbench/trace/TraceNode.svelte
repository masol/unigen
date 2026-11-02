<!-- 单个 trace 节点：按 kind/status 渲染，支持递归嵌套 -->
<script lang="ts">
  import MarkdownView from "$lib/components/markdown/Message.svelte";
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import * as Trace from "$lib/components/ui/trace";
  import type { TraceNode } from "$lib/store/local/chat.types";
  import {
    IconAlertTriangle,
    IconArrowUpRight,
    IconBrain,
    IconCircleDashed,
    IconLink,
    IconLoader2,
    IconRobot,
    IconTool,
  } from "@tabler/icons-svelte";
  import Self from "./TraceNode.svelte";

  let { node, depth = 1 }: { node: TraceNode; depth?: number } = $props();

  let running = $derived(node.status === "running");

  let traceStatus = $derived<"running" | "error" | "pending" | undefined>(
    node.status === "running"
      ? "running"
      : node.status === "error"
        ? "error"
        : node.status === "pending"
          ? "pending"
          : undefined,
  );

  // ── 1Hz 心跳：仅当节点运行中时存在，驱动耗时文字自动滚动 ──
  let now = $state(Date.now());
  $effect(() => {
    if (!running) return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  let autoDuration = $derived.by<string | undefined>(() => {
    if (!node.startedAt) return undefined;
    const end = node.finishedAt ?? now;
    const ms = Math.max(0, end - node.startedAt);
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  });

  /** 非 agent 节点的次要文字（agent 的 "name · model" 在模板内渲染） */
  let descriptionText = $derived(
    node.kind === "agent" ? undefined : (node.description ?? autoDuration),
  );

  let expandable = $derived(
    !!node.detail || (node.kind === "agent" && node.children.length > 0),
  );

  // 深层节点显示 L{n} 微标签（>3 层时启用）
  let showDepthBadge = $derived(depth >= 3);

  // 用户点击前跟随 running；点击后以 userOpen 为准
  let userOpen = $state<boolean | undefined>(undefined);
  let open = $derived(userOpen ?? running);
</script>

{#snippet leadingIcon()}
  {#if node.status === "running"}
    <IconLoader2 size={16} stroke={1.5} class="animate-spin" />
  {:else if node.status === "error"}
    <IconAlertTriangle size={16} stroke={1.5} />
  {:else if node.status === "pending"}
    <IconCircleDashed size={16} stroke={1.5} />
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
    title={`嵌套层级 L${depth}`}
  >
    L{depth}
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
    <Trace.CollapsibleContent>
      {#if node.detail}
        <div class="text-foreground">
          <MarkdownView
            message={{ content: node.detail }}
            streaming={node.streaming}
          />
        </div>
      {/if}
      {#if node.kind === "agent" && node.children.length > 0}
        <div class:mt-2={!!node.detail}>
          <Trace.Root>
            {#each node.children as child (child.id)}
              <Self node={child} depth={depth + 1} />
            {/each}
          </Trace.Root>
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
