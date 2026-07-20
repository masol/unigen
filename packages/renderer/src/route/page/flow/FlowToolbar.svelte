<!-- src/lib/flow/FlowToolbar.svelte -->
<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { Toggle } from "$lib/components/ui/toggle";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconAlertTriangle,
    IconArrowBackUp,
    IconChevronRight,
    IconHome,
    IconLayout2,
    IconMap2,
    IconMaximize,
    IconRefresh,
    IconSitemap,
  } from "@tabler/icons-svelte";
  import { flowStore } from "./store.svelte";

  const crumbs = $derived(flowStore.crumbs);
  const canUp = $derived(flowStore.depth > 1);
</script>

<div
  class="flex h-16 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-6 backdrop-blur-sm"
>
  <!-- 左：标识 + 上钻 -->
  <div class="flex shrink-0 items-center gap-2">
    <div
      class="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
    >
      <IconSitemap size={20} stroke={1.5} />
    </div>
    <div class="flex flex-col leading-tight">
      <span class="text-sm font-medium tracking-tight">DAG 视图</span>
      <span class="text-xs text-muted-foreground"
        >{flowStore.id || "untitled"}</span
      >
    </div>
  </div>

  <Separator orientation="vertical" class="h-8" />

  <Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="outline"
            size="icon"
            class="rounded-xl"
            disabled={!canUp}
            onclick={() => flowStore.goUp()}
          >
            <IconArrowBackUp size={20} stroke={1.5} />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>返回上一层</Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>

  <!--╭─────────────────────────────────────────────────────╮ -->
  <!-- │ [可抽取子组件 → FlowBreadcrumbs.svelte]             │ -->
  <!-- │ 职责：可点击的层级面包屑，点击任意层回退到该图       │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <nav
    class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    use:autoAnimate
  >
    {#each crumbs as crumb, i (crumb.graphId + "@" + i)}
      {#if i > 0}
        <IconChevronRight
          size={16}
          stroke={1.5}
          class="shrink-0 text-muted-foreground/60"
        />
      {/if}
      <button
        type="button"
        onclick={() => flowStore.goToCrumb(i)}
        class={[
          "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-all duration-200",
          i === crumbs.length - 1
            ? "bg-muted font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        ]}
      >
        {#if i === 0}
          <IconHome size={16} stroke={1.5} />
        {/if}
        <span class="max-w-40 truncate">{crumb.label}</span>
      </button>
    {/each}
  </nav>
  <!-- ╭─── / FlowBreadcrumbs ───╮ -->

  <Separator orientation="vertical" class="h-8" />

  <!-- 右：统计 + 视图控制 -->
  <div class="flex shrink-0 items-center gap-2">
    <Badge variant="secondary" class="rounded-lg text-xs">
      {flowStore.nodeCount} 节点 · {flowStore.edgeCount} 边
    </Badge>
    {#if flowStore.conflictCount > 0}
      <Badge variant="destructive" class="gap-1 rounded-lg">
        <IconAlertTriangle size={14} stroke={1.5} />
        {flowStore.conflictCount} 冲突
      </Badge>
    {/if}

    <Tooltip.Provider delayDuration={200}>
      <!-- 刷新：忽略缓存重新加载 -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="icon"
              class="rounded-xl"
              disabled={flowStore.loading}
              onclick={() => flowStore.refresh()}
            >
              <IconRefresh
                size={20}
                stroke={1.5}
                class={flowStore.loading ? "animate-spin" : ""}
              />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>刷新（忽略缓存）</Tooltip.Content>
      </Tooltip.Root>

      <!-- 自动布局：dagre 重排，丢弃拖拽位置 -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="icon"
              class="rounded-xl"
              disabled={flowStore.loading}
              onclick={() => flowStore.relayout()}
            >
              <IconLayout2 size={20} stroke={1.5} />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>重新自动布局</Tooltip.Content>
      </Tooltip.Root>

      <!-- 缩略图开关 -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Toggle
              {...props}
              pressed={flowStore.miniMap}
              onPressedChange={() => flowStore.toggleMiniMap()}
              class="rounded-xl"
            >
              <IconMap2 size={20} stroke={1.5} />
            </Toggle>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>缩略图</Tooltip.Content>
      </Tooltip.Root>

      <!-- 适应视图 -->
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="icon"
              class="rounded-xl"
              onclick={() => flowStore.requestFit()}
            >
              <IconMaximize size={20} stroke={1.5} />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>适应视图</Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </div>
</div>
