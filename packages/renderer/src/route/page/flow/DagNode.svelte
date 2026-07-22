<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import * as HoverCard from "$lib/components/ui/hover-card";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import {
    IconAlertTriangle,
    IconBolt,
    IconChevronRight,
    IconLogin2,
    IconLogout2,
    IconPackages,
    IconShieldCheck,
    IconSparkles,
    IconStack2,
  } from "@tabler/icons-svelte";
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import StatusDot from "./StatusDot.svelte";
  import {
    flowStore,
    GUARD_KIND_LABEL,
    KIND_ICON,
    KIND_LABEL,
    MAP_MODE_DESC,
    MAP_MODE_LABEL,
    RISK_LABEL,
    SIZE_DESC,
    STATUS_LABEL,
    STATUS_TONE,
    type FlowNodeData,
  } from "./store.svelte";

  let { id, data, selected }: NodeProps & { data: FlowNodeData } = $props();

  const pnode = $derived(data.pnode);
  const tone = $derived(STATUS_TONE[pnode.status]);
  const KindIcon = $derived(KIND_ICON[pnode.kind]);

  const toneRing = $derived(
    tone === "destructive"
      ? "ring-destructive/40"
      : tone === "primary"
        ? "ring-primary/40"
        : tone === "accent"
          ? "ring-accent/40"
          : "ring-border/50",
  );

  const mapRing = $derived(
    data.mapMode
      ? data.mapMode === "sequential"
        ? "ring-1 ring-primary/40 border-primary/30"
        : "ring-1 ring-primary/60 border-primary/40"
      : "",
  );

  function handleDblClick() {
    if (data.hasChildren) flowStore.drillInto(id);
  }

  const risk = $derived(pnode.risk ?? null);
  const isHighRisk = $derived(risk === "high");
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → DagNode.svelte]                     │ -->
<!-- │ 职责：DAG 节点卡片 + hover 详情 + 双击下钻          │ -->
<!-- │ 强化：可下钻节点常驻醒目标识（角标 + 底部提示条）   │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<HoverCard.Root openDelay={260} closeDelay={80}>
  <HoverCard.Trigger>
    {#snippet child({ props })}
      <div
        {...props}
        ondblclick={handleDblClick}
        class={[
          "group relative w-65 rounded-2xl border border-border/50 bg-background text-left shadow-sm transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-xl",
          data.mapMode ? mapRing : "",
          selected ? `ring-2 ${toneRing}` : "",
          // 可下钻节点整体降沉一层「纸叠」质感：左上主色竖条
          data.hasChildren ? "cursor-pointer" : "",
        ]}
        role="button"
        tabindex="0"
      >
        <!-- 可下钻：卡片左沿主色竖条（常驻，扫一眼就能识别）-->
        {#if data.hasChildren}
          <span
            class="pointer-events-none absolute left-0 top-3 bottom-3 w-1 rounded-full bg-primary/70"
          ></span>
        {/if}

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

        <div class="p-4">
          <!-- 头部 -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <StatusDot status={pnode.status} />
              <span class="truncate text-sm font-medium tracking-tight">
                {pnode.name}
              </span>
            </div>
            {#if data.hasChildren}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props: tp })}
                    <div
                      {...tp}
                      class="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
                    >
                      <IconStack2 size={14} stroke={1.5} />
                    </div>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content class="rounded-xl text-xs">
                  含子图 · 双击下钻
                </Tooltip.Content>
              </Tooltip.Root>
            {/if}
          </div>

          <!-- 类型标签行 -->
          <div class="mt-2 flex items-center gap-1.5">
            <div
              class="flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground"
              title={KIND_LABEL[pnode.kind]}
            >
              <KindIcon size={12} stroke={1.5} />
            </div>
            <Badge
              variant="outline"
              class="rounded-md px-1.5 py-0 text-[10px] font-normal"
            >
              {KIND_LABEL[pnode.kind]}
            </Badge>
            <Badge
              variant="outline"
              class="ml-auto rounded-md px-1.5 py-0 text-[10px] font-normal"
            >
              {STATUS_LABEL[pnode.status]}
            </Badge>
          </div>

          <!-- 意图 -->
          <p class="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {pnode.intent}
          </p>

          <!-- IO 计数 + 映射/风险 -->
          <div class="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
            <span class="flex items-center gap-0.5 text-muted-foreground">
              <IconLogin2 size={12} stroke={1.5} />
              {pnode.inputs.length}
            </span>
            <span class="flex items-center gap-0.5 text-muted-foreground">
              <IconLogout2 size={12} stroke={1.5} />
              {pnode.outputs.length}
            </span>

            {#if data.mapMode}
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props: tipProps })}
                    <span
                      {...tipProps}
                      class={[
                        "ml-auto flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
                        data.mapMode === "sequential"
                          ? "border border-dashed border-primary/40 text-primary"
                          : "bg-primary/15 text-primary",
                      ]}
                    >
                      <IconPackages size={12} stroke={1.5} />
                      {MAP_MODE_LABEL[data.mapMode!]}
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content class="rounded-xl text-xs">
                  {MAP_MODE_DESC[data.mapMode]}
                </Tooltip.Content>
              </Tooltip.Root>
            {:else if risk}
              <span
                class={[
                  "ml-auto rounded-md px-1.5 py-0.5 font-medium",
                  isHighRisk
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground",
                ]}
              >
                {RISK_LABEL[risk]}
              </span>
            {/if}
          </div>

          <!-- 守护 / 合成 / 强制 -->
          {#if pnode.guard || pnode.synthetic || pnode.forcedNote}
            <div class="mt-2 flex flex-wrap items-center gap-1">
              {#if pnode.guard}
                <Badge
                  variant="outline"
                  class="gap-0.5 rounded-md border-accent/50 px-1.5 py-0 text-[10px] text-accent"
                >
                  <IconShieldCheck size={10} stroke={1.5} />
                  守护
                </Badge>
              {/if}
              {#if pnode.synthetic}
                <Badge
                  variant="outline"
                  class="gap-0.5 rounded-md border-accent/50 px-1.5 py-0 text-[10px] text-accent"
                >
                  <IconSparkles size={10} stroke={1.5} />
                  合成
                </Badge>
              {/if}
              {#if pnode.forcedNote}
                <Badge
                  variant="outline"
                  class="gap-0.5 rounded-md border-destructive/40 px-1.5 py-0 text-[10px] text-destructive"
                >
                  <IconBolt size={10} stroke={1.5} />
                  强制落叶
                </Badge>
              {/if}
            </div>
          {/if}
        </div>

        <!-- 底部常驻「下钻」提示条：可下钻节点专属，一目了然 -->
        {#if data.hasChildren}
          <div
            class="flex items-center justify-between gap-1 rounded-b-2xl border-t border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-medium text-primary"
          >
            <span class="flex items-center gap-1">
              <IconStack2 size={12} stroke={1.5} />
              含子图
            </span>
            <span class="flex items-center gap-0.5 opacity-80">
              双击进入
              <IconChevronRight size={12} stroke={1.5} />
            </span>
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
            {KIND_LABEL[pnode.kind]} · {STATUS_LABEL[pnode.status]}
          </p>
        </div>
      </div>

      <p class="text-sm text-foreground/90">{pnode.intent}</p>

      <div class="flex flex-wrap items-center gap-1.5">
        {#if data.mapMode}
          <Badge
            class={[
              "gap-1 rounded-lg text-[11px]",
              data.mapMode === "sequential"
                ? "border border-dashed border-primary/40 bg-transparent text-primary"
                : "",
            ]}
          >
            <IconPackages size={12} stroke={1.5} />
            {MAP_MODE_LABEL[data.mapMode]}
          </Badge>
        {/if}
        {#if risk}
          <Badge
            variant={isHighRisk ? "destructive" : "outline"}
            class="rounded-lg text-[11px]"
          >
            {RISK_LABEL[risk]}
          </Badge>
        {/if}
        {#if pnode.guard}
          <Badge
            variant="outline"
            class="gap-1 rounded-lg text-[11px] text-accent"
          >
            <IconShieldCheck size={12} stroke={1.5} />
            守护
            {#if pnode.guardKinds?.length}
              · {pnode.guardKinds.map((k) => GUARD_KIND_LABEL[k]).join("/")}
            {/if}
          </Badge>
        {/if}
        {#if pnode.synthetic}
          <Badge
            variant="outline"
            class="gap-1 rounded-lg text-[11px] text-accent"
          >
            <IconSparkles size={12} stroke={1.5} />
            合成
          </Badge>
        {/if}
      </div>

      {#if data.mapMode}
        <p class="text-[11px] text-muted-foreground">
          {MAP_MODE_DESC[data.mapMode]}
        </p>
      {/if}

      <Separator />

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">输入产物</p>
        <div class="flex flex-wrap gap-1.5">
          {#each flowStore.resolveIOList(pnode.inputs) as io (io.name)}
            <button
              type="button"
              onclick={() => flowStore.selectArtifact(io.name, "input")}
              class="cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
            >
              <Badge
                variant={io.artifact?.isArray ? "default" : "secondary"}
                class="gap-1 rounded-lg text-[11px] hover:shadow-xl"
              >
                {#if io.artifact?.isArray}
                  <IconPackages size={10} stroke={1.5} />
                {/if}
                {io.name}
                {#if io.artifact}
                  <span class="opacity-60"
                    >· {SIZE_DESC[io.artifact.sizeEstimate]}</span
                  >
                {/if}
              </Badge>
            </button>
          {/each}
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">输出产物</p>
        <div class="flex flex-wrap gap-1.5">
          {#each flowStore.resolveIOList(pnode.outputs) as io (io.name)}
            <button
              type="button"
              onclick={() => flowStore.selectArtifact(io.name, "output")}
              class="cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
            >
              <Badge
                variant={io.artifact?.isArray ? "default" : "secondary"}
                class="gap-1 rounded-lg text-[11px] hover:shadow-xl"
              >
                {#if io.artifact?.isArray}
                  <IconPackages size={10} stroke={1.5} />
                {/if}
                {io.name}
                {#if io.artifact}
                  <span class="opacity-60"
                    >· {SIZE_DESC[io.artifact.sizeEstimate]}</span
                  >
                {/if}
              </Badge>
            </button>
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
        <div
          class="flex items-center gap-1.5 rounded-xl bg-primary/10 p-3 text-[11px] text-primary"
        >
          <IconStack2 size={14} stroke={1.5} />
          双击节点可下钻进入其子图
        </div>
      {/if}
    </div>
  </HoverCard.Content>
</HoverCard.Root>
<!-- ╭─── / DagNode ───╮ -->
