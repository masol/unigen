<!-- src/lib/flow/DagNode.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import { Separator } from "$lib/components/ui/separator";
  import {
    IconAlertTriangle,
    IconArrowRight,
    IconBolt,
    IconLogin2,
    IconLogout2,
    IconStack2,
  } from "@tabler/icons-svelte";
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import StatusDot from "./StatusDot.svelte";
  import {
    flowStore,
    STATUS_LABEL,
    STATUS_TONE,
    type FlowNodeData,
  } from "./store.svelte";

  let { id, data, selected }: NodeProps & { data: FlowNodeData } = $props();

  const pnode = $derived(data.pnode);
  const tone = $derived(STATUS_TONE[pnode.status]);

  const toneRing = $derived(
    tone === "destructive"
      ? "ring-destructive/40"
      : tone === "primary"
        ? "ring-primary/40"
        : tone === "accent"
          ? "ring-accent/40"
          : "ring-border/50",
  );

  function handleDblClick() {
    if (data.hasChildren) flowStore.drillInto(id);
  }
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → DagNode.svelte]                     │ -->
<!-- │ 职责：DAG 节点卡片 + hover 详情 + 双击下钻           │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<HoverCard.Root openDelay={260} closeDelay={80}>
  <HoverCard.Trigger>
    {#snippet child({ props })}
      <div
        {...props}
        ondblclick={handleDblClick}
        class={[
          "group relative w-65 rounded-2xl border border-border/50 bg-background p-4 text-left shadow-sm transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-xl",
          selected ? `ring-2 ${toneRing}` : "",
        ]}
        role="button"
        tabindex="0"
      >
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          class="size-2.5! border-2! border-background! bg-muted-foreground/60!"
        />
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          class="size-2.5! border-2! border-background! bg-primary/70!"
        />

        <!-- 头部 -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <StatusDot status={pnode.status} />
            <span class="truncate text-sm font-medium tracking-tight">
              {pnode.name}
            </span>
          </div>
          {#if data.hasChildren}
            <div
              class="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              title="含子图 · 双击下钻"
            >
              <IconStack2 size={16} stroke={1.5} />
            </div>
          {/if}
        </div>

        <!-- 意图 -->
        <p class="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {pnode.intent}
        </p>

        <!-- IO 计数 + 状态 -->
        <div class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span class="flex items-center gap-1">
            <IconLogin2 size={14} stroke={1.5} />
            {pnode.inputs.length}
          </span>
          <span class="flex items-center gap-1">
            <IconLogout2 size={14} stroke={1.5} />
            {pnode.outputs.length}
          </span>
          <Badge variant="outline" class="ml-auto rounded-lg text-[10px]">
            {STATUS_LABEL[pnode.status]}
          </Badge>
        </div>

        {#if pnode.forcedNote}
          <div
            class="mt-2 flex items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1 text-[10px] text-destructive"
          >
            <IconBolt size={12} stroke={1.5} />
            强制落叶
          </div>
        {/if}
      </div>
    {/snippet}
  </HoverCard.Trigger>

  <HoverCard.Content
    class="w-80 rounded-2xl border-border/50 p-0 shadow-xl"
    side="top"
  >
    <div class="space-y-4 p-5">
      <div class="flex items-start gap-2">
        <StatusDot status={pnode.status} />
        <div class="min-w-0">
          <p class="text-sm font-medium tracking-tight">{pnode.name}</p>
          <p class="text-xs text-muted-foreground">
            {STATUS_LABEL[pnode.status]}
          </p>
        </div>
      </div>

      <p class="text-sm text-foreground/90">{pnode.intent}</p>

      <Separator />

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">输入产物</p>
        <div class="flex flex-wrap gap-1.5">
          {#each pnode.inputs as io (io.name)}
            <Badge variant="secondary" class="rounded-lg text-[11px]"
              >{io.name}</Badge
            >
          {/each}
        </div>
      </div>

      <div class="space-y-2">
        <p
          class="flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          输出产物 <IconArrowRight size={12} stroke={1.5} />
        </p>
        <div class="flex flex-wrap gap-1.5">
          {#each pnode.outputs as io (io.name)}
            <Badge class="rounded-lg text-[11px]">{io.name}</Badge>
          {/each}
        </div>
      </div>

      {#if Object.keys(pnode.facets).length > 0}
        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">并行判定维度</p>
          <div class="flex flex-wrap gap-1.5">
            {#each Object.entries(pnode.facets) as [k, v] (k)}
              <Badge variant="outline" class="rounded-lg text-[11px]">
                {k}：{v === "yes" ? "是" : v === "no" ? "否" : "待定"}
              </Badge>
            {/each}
          </div>
        </div>
      {/if}

      {#if pnode.error}
        <div
          class="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive"
        >
          <IconAlertTriangle size={16} stroke={1.5} class="mt-0.5 shrink-0" />
          <span>{pnode.error}</span>
        </div>
      {/if}

      {#if pnode.forcedNote}
        <div
          class="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"
        >
          <IconBolt size={16} stroke={1.5} class="mt-0.5 shrink-0" />
          <span>{pnode.forcedNote}</span>
        </div>
      {/if}

      {#if data.hasChildren}
        <div class="text-[11px] text-muted-foreground">
          双击节点可下钻进入其子图
        </div>
      {/if}
    </div>
  </HoverCard.Content>
</HoverCard.Root>
<!-- ╭─── / DagNode ───╮ -->
