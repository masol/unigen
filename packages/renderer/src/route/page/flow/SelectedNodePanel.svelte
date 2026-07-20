<!-- src/lib/flow/SelectedNodePanel.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
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

  import type { PNode } from "./store.svelte";

  const node = $derived<PNode | null>(flowStore.selectedNode);
  const hasChildren = $derived(
    node
      ? (flowStore.nodes.find((n) => n.id === node.id)?.data.hasChildren ??
          false)
      : false,
  );
</script>

<!--╭─────────────────────────────────────────────────────╮ -->
<!-- │ [可抽取子组件 → SelectedNodePanel.svelte]           │ -->
<!-- │ 职责：画布右上角固定的选中节点属性浮层               │ -->
<!-- ╰─────────────────────────────────────────────────────╯ -->
<div use:autoAnimate>
  {#if node}
    <div
      class="flex max-h-[70vh] w-72 flex-col overflow-hidden rounded-2xl border border-border/50 bg-background shadow-xl"
    >
      <!-- 头部：固定不滚动 -->
      <div class="flex shrink-0 items-start justify-between gap-2 p-4 pb-3">
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

      <Separator class="shrink-0" />

      <!-- 内容：受约束滚动区（min-h-0 是 flex 子项可收缩的关键） -->
      <ScrollArea class="min-h-0 flex-1">
        <div class="space-y-4 p-4">
          <p class="text-xs text-muted-foreground">{node.intent}</p>

          <Separator />

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">输入</p>
            <div class="flex flex-wrap gap-1.5">
              {#each node.inputs as io (io.name)}
                <Badge variant="secondary" class="rounded-lg text-[11px]">
                  {io.name}
                </Badge>
              {/each}
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">输出</p>
            <div class="flex flex-wrap gap-1.5">
              {#each node.outputs as io (io.name)}
                <Badge class="rounded-lg text-[11px]">{io.name}</Badge>
              {/each}
            </div>
          </div>

          {#if Object.keys(node.facets).length > 0}
            <div class="space-y-2">
              <p class="text-xs font-medium text-muted-foreground">Facets</p>
              <div class="flex flex-wrap gap-1.5">
                {#each Object.entries(node.facets) as [k, v] (k)}
                  <Badge variant="outline" class="rounded-lg text-[11px]">
                    {k}：{TRISTATE_LABEL[v] ?? v}
                  </Badge>
                {/each}
              </div>
            </div>
          {/if}

          {#if node.error}
            <div
              class="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive"
            >
              <IconAlertTriangle
                size={16}
                stroke={1.5}
                class="mt-0.5 shrink-0"
              />
              <span class="break-words">{node.error}</span>
            </div>
          {/if}

          {#if node.forcedNote}
            <div
              class="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground"
            >
              <IconBolt size={16} stroke={1.5} class="mt-0.5 shrink-0" />
              <span class="break-words">{node.forcedNote}</span>
            </div>
          {/if}
        </div>
      </ScrollArea>

      <!-- 底部操作：固定不滚动 -->
      {#if hasChildren}
        <div class="shrink-0 border-t border-border/50 p-3">
          <Button
            variant="outline"
            class="w-full gap-2 rounded-xl"
            onclick={() => node && flowStore.drillInto(node.id)}
          >
            <IconStack2 size={16} stroke={1.5} />
            下钻进入子图
          </Button>
        </div>
      {/if}
    </div>
  {/if}
</div>
<!-- ╭─── / SelectedNodePanel ───╮ -->
