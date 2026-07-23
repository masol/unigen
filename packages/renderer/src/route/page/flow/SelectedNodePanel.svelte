<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertTriangle,
    IconBolt,
    IconPackages,
    IconPencil,
    IconShieldCheck,
    IconSparkles,
    IconStack2,
    IconX,
  } from "@tabler/icons-svelte";
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
    TRISTATE_LABEL,
    type ArtifactRole,
    type ResolvedIo,
  } from "./store.svelte";

  const node = $derived(flowStore.selectedNode);
  const resolved = $derived(flowStore.selectedNodeResolved);
  const facetEntries = $derived(
    node?.facets ? Object.entries(node.facets) : [],
  );

  const nodeData = $derived(
    node ? flowStore.nodes.find((n) => n.id === node.id)?.data : undefined,
  );
  const hasChildren = $derived(nodeData?.hasChildren ?? false);
  const mapMode = $derived(nodeData?.mapMode ?? null);

  const KindIcon = $derived(node ? KIND_ICON[node.kind] : null);
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → NodeIoRow.svelte]                   │ -->
<!-- │ 职责：单条 IO 行 —— 编辑按钮 + 不换行省略徽章       │ -->
<!-- │ 修复：高亮改用 store.isArtifactActive（真源判据）   │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
{#snippet ioRow(io: ResolvedIo, role: ArtifactRole)}
  {@const isActive = flowStore.isArtifactActive(io.name)}
  <div class="flex items-center gap-1.5">
    <Button
      variant="ghost"
      size="icon"
      class="size-6 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
      title="编辑产物"
      onclick={() => node && flowStore.editArtifact(node.id, io.name, role)}
    >
      <IconPencil size={14} stroke={1.5} />
    </Button>
    <button
      type="button"
      onclick={() => flowStore.selectArtifact(io.name, role)}
      class="min-w-0 flex-1 cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
    >
      <Badge
        variant={isActive
          ? "default"
          : io.artifact?.isArray
            ? "default"
            : "secondary"}
        class={[
          "flex w-full items-center gap-1 rounded-lg text-[11px] hover:shadow-xl",
          isActive ? "ring-2 ring-primary/40" : "",
        ]}
      >
        {#if io.artifact?.isArray}
          <IconPackages size={10} stroke={1.5} class="shrink-0" />
        {/if}
        <span class="truncate">{io.name}</span>
        {#if io.artifact}
          <span class="shrink-0 opacity-60"
            >· {SIZE_DESC[io.artifact.sizeEstimate]}</span
          >
        {/if}
      </Badge>
    </button>
  </div>
{/snippet}
<!-- ╭─── / NodeIoRow ───╮ -->

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → SelectedNodePanel.svelte]           │ -->
<!-- │ 职责：右上角选中节点属性浮层；IO 可点击/可编辑      │ -->
<!-- │ 修复：高亮判据改用 store.isArtifactActive；不换行   │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div use:autoAnimate>
  {#if node && KindIcon}
    <div
      class="flex max-h-80 w-72 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background/90 shadow-xl backdrop-blur-sm"
    >
      <div class="flex shrink-0 items-start justify-between gap-2 p-4 pb-3">
        <div class="flex min-w-0 items-start gap-2">
          <div class="mt-1"><StatusDot status={node.status} /></div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium tracking-tight">
              {node.name}
            </p>
            <p class="text-xs text-muted-foreground">
              {KIND_LABEL[node.kind]} · {STATUS_LABEL[node.status]}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 rounded-lg"
          onclick={() => flowStore.selectNode(null)}
        >
          <IconX size={16} stroke={1.5} />
        </Button>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pt-0">
        <p class="text-xs text-muted-foreground">{node.intent}</p>

        <div class="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" class="gap-1 rounded-lg text-[11px]">
            <KindIcon size={12} stroke={1.5} />
            {KIND_LABEL[node.kind]}
          </Badge>
          {#if mapMode}
            <Badge
              class={[
                "gap-1 rounded-lg text-[11px]",
                mapMode === "sequential"
                  ? "border border-dashed border-primary/40 bg-transparent text-primary"
                  : "",
              ]}
            >
              <IconPackages size={12} stroke={1.5} />
              {MAP_MODE_LABEL[mapMode]}
            </Badge>
          {/if}
          {#if node.risk}
            <Badge
              variant={node.risk === "high" ? "destructive" : "outline"}
              class="rounded-lg text-[11px]"
            >
              {RISK_LABEL[node.risk]}
            </Badge>
          {/if}
          {#if node.guard}
            <Badge
              variant="outline"
              class="gap-1 rounded-lg text-[11px] text-accent"
            >
              <IconShieldCheck size={12} stroke={1.5} />
              守护
              {#if node.guardKinds?.length}
                · {node.guardKinds.map((k) => GUARD_KIND_LABEL[k]).join("/")}
              {/if}
            </Badge>
          {/if}
          {#if node.synthetic}
            <Badge
              variant="outline"
              class="gap-1 rounded-lg text-[11px] text-accent"
            >
              <IconSparkles size={12} stroke={1.5} />
              合成
            </Badge>
          {/if}
        </div>

        {#if mapMode}
          <p class="text-[11px] text-muted-foreground">
            {MAP_MODE_DESC[mapMode]}
          </p>
        {/if}

        <Separator />

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">
            输入（点击查看 · 左侧可编辑）
          </p>
          <div class="space-y-1.5">
            {#each resolved.inputs as io (io.name)}
              {@render ioRow(io, "input")}
            {:else}
              <span class="text-[11px] text-muted-foreground/60">无</span>
            {/each}
          </div>
        </div>

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">
            输出（点击查看 · 左侧可编辑）
          </p>
          <div class="space-y-1.5">
            {#each resolved.outputs as io (io.name)}
              {@render ioRow(io, "output")}
            {:else}
              <span class="text-[11px] text-muted-foreground/60">无</span>
            {/each}
          </div>
        </div>

        {#if facetEntries.length > 0}
          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">Facets</p>
            <div class="flex flex-wrap gap-1.5">
              {#each facetEntries as [k, v] (k)}
                <Badge variant="outline" class="rounded-lg text-[11px]">
                  {k}：{TRISTATE_LABEL[v as string] ?? v}
                </Badge>
              {/each}
            </div>
          </div>
        {/if}

        {#if node.error}
          <div
            class="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive"
          >
            <IconAlertTriangle size={16} stroke={1.5} class="mt-0.5 shrink-0" />
            <span>{node.error}</span>
          </div>
        {/if}

        {#if node.forcedNote}
          <div
            class="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"
          >
            <IconBolt size={16} stroke={1.5} class="mt-0.5 shrink-0" />
            <span>{node.forcedNote}</span>
          </div>
        {/if}

        {#if hasChildren}
          <Button
            variant="outline"
            class="w-full gap-2 rounded-xl"
            onclick={() => flowStore.drillInto(node.id)}
          >
            <IconStack2 size={16} stroke={1.5} />
            下钻进入子图
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</div>
<!-- ╭─── / SelectedNodePanel ───╮ -->
