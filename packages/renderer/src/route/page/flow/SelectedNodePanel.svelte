<!-- src/lib/flow/SelectedNodePanel.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertTriangle,
    IconBolt,
    IconStack2,
    IconX,
  } from "@tabler/icons-svelte";
  import StatusDot from "./StatusDot.svelte";
  import { flowStore, STATUS_LABEL, TRISTATE_LABEL } from "./store.svelte";

  // ── 全部经过空值兜底，杜绝中间态 undefined ──
  const node = $derived(flowStore.selectedNode);
  const inputs = $derived(node?.inputs ?? []);
  const outputs = $derived(node?.outputs ?? []);
  const facetEntries = $derived(
    node?.facets ? Object.entries(node.facets) : [],
  );
  const hasChildren = $derived(
    node
      ? (flowStore.nodes.find((n) => n.id === node.id)?.data.hasChildren ??
          false)
      : false,
  );
  // 当前正在详情面板查看的产物名，用于高亮激活的 Badge
  const activeArtifact = $derived(flowStore.selectedArtifactName);
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → SelectedNodePanel.svelte]           │ -->
<!-- │ 职责：画布右上角固定的选中节点属性浮层；IO 可点击    │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div use:autoAnimate>
  {#if node}
    <div
      class="w-72 overflow-hidden rounded-2xl border border-border/50 bg-background/90 shadow-xl backdrop-blur-sm"
    >
      <div class="flex items-start justify-between gap-2 p-4 pb-0">
        <div class="flex min-w-0 items-start gap-2">
          <div class="mt-1"><StatusDot status={node.status} /></div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium tracking-tight">
              {node.name}
            </p>
            <p class="text-xs text-muted-foreground">
              {STATUS_LABEL[node.status]}
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

      <!-- 原生滚动容器替代 ScrollArea，规避 Panel+motion 时序崩溃 -->
      <div class="max-h-80 space-y-4 overflow-y-auto p-4">
        <p class="text-xs text-muted-foreground">{node.intent}</p>

        <Separator />

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">
            输入（点击查看产物）
          </p>
          <div class="flex flex-wrap gap-1.5">
            {#each inputs as io (io.name)}
              <button
                type="button"
                onclick={() => flowStore.selectArtifact(io.name, "input")}
                class="cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
              >
                <Badge
                  variant={activeArtifact === io.name ? "default" : "secondary"}
                  class="rounded-lg text-[11px] hover:shadow-xl"
                >
                  {io.name}
                </Badge>
              </button>
            {:else}
              <span class="text-[11px] text-muted-foreground/60">无</span>
            {/each}
          </div>
        </div>

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">
            输出（点击查看产物）
          </p>
          <div class="flex flex-wrap gap-1.5">
            {#each outputs as io (io.name)}
              <button
                type="button"
                onclick={() => flowStore.selectArtifact(io.name, "output")}
                class="cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
              >
                <Badge
                  variant={activeArtifact === io.name ? "default" : "secondary"}
                  class="rounded-lg text-[11px] hover:shadow-xl"
                >
                  {io.name}
                </Badge>
              </button>
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
