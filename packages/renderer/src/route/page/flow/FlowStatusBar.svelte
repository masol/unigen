<!-- src/lib/flow/FlowStatusBar.svelte -->
<!-- 底部状态栏：只读 flowStore。左=文件名，右=图规模/风险聚合+RunState，零直接通信。 -->
<!-- 无外层容器：背景/高度/内边距由父级提供，仅靠 ml-auto 分左右两列。 -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import {
    IconAlertTriangle,
    IconArrowsRightLeft,
    IconCircleCheck,
    IconFileText,
    IconPackages,
    IconShieldCheck,
    IconSitemap,
    IconStack2,
    IconTopologyStar3,
  } from "@tabler/icons-svelte";
  import RunState from "../../RunState.svelte";
  import { flowStore as store } from "./store.svelte";

  // 后端读取键：.${id}_state —— 直接作为文件名展示在左侧
  const fileName = $derived(`.${store.id}_state`);
</script>

{#if store.loading}
  <Skeleton class="h-3 w-32 rounded-lg" />
  <Skeleton class="ml-auto h-3 w-20 rounded-lg" />
  <Skeleton class="h-3 w-24 rounded-lg" />
{:else}
  <!-- 左：文件名（.${id}_state） -->
  <div class="flex min-w-0 items-center gap-1.5">
    <IconFileText size={20} stroke={1.5} class="size-3.5 shrink-0" />
    <span class="truncate font-medium text-foreground/80" title={fileName}>
      {fileName}
    </span>
  </div>

  <!-- 层级深度 -->
  <div class="ml-auto flex items-center gap-1.5">
    <IconStack2 size={20} stroke={1.5} class="size-3.5" />
    <span>第 {store.depth} 层</span>
  </div>

  <!-- 节点数 -->
  <div class="flex items-center gap-1.5">
    <IconSitemap size={20} stroke={1.5} class="size-3.5" />
    <span>{store.nodeCount} 节点</span>
  </div>

  <!-- 产物边 -->
  <div class="flex items-center gap-1.5">
    <IconArrowsRightLeft size={20} stroke={1.5} class="size-3.5" />
    <span>{store.edgeCount} 产物边</span>
  </div>

  <!-- 可下钻数 -->
  {#if store.drillableCount > 0}
    <Tooltip.Root>
      <Tooltip.Trigger class="flex items-center gap-1.5">
        <IconTopologyStar3 size={20} stroke={1.5} class="size-3.5" />
        <span>{store.drillableCount} 含子图</span>
      </Tooltip.Trigger>
      <Tooltip.Content>
        本层有 {store.drillableCount} 个可下钻节点，双击进入
      </Tooltip.Content>
    </Tooltip.Root>
  {/if}

  <!-- 映射节点 -->
  {#if store.mapNodeCount > 0}
    <Tooltip.Root>
      <Tooltip.Trigger class="flex items-center gap-1.5 text-primary">
        <IconPackages size={20} stroke={1.5} class="size-3.5" />
        <span>{store.mapNodeCount} 映射</span>
      </Tooltip.Trigger>
      <Tooltip.Content>
        含数组产物的映射节点（并发 / 顺序）共 {store.mapNodeCount} 个
      </Tooltip.Content>
    </Tooltip.Root>
  {/if}

  <!-- 守护节点 -->
  {#if store.guardCount > 0}
    <div class="flex items-center gap-1.5 text-accent">
      <IconShieldCheck size={20} stroke={1.5} class="size-3.5" />
      <span>{store.guardCount} 守护</span>
    </div>
  {/if}

  <!-- 健康度聚合 -->
  {#if store.conflictCount > 0}
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger class="flex items-center gap-1.5 text-destructive">
          <IconAlertTriangle size={20} stroke={1.5} class="size-3.5" />
          <span>{store.conflictCount}</span>
          {#if store.highRiskCount > 0}
            <span class="text-destructive/80"
              >· {store.highRiskCount} 高风险</span
            >
          {/if}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {store.conflictCount} 个冲突节点，{store.highRiskCount} 个高风险节点
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  {:else if store.highRiskCount > 0}
    <div class="flex items-center gap-1.5 text-primary">
      <IconAlertTriangle size={20} stroke={1.5} class="size-3.5" />
      <span>{store.highRiskCount} 高风险</span>
    </div>
  {:else if store.nodeCount > 0}
    <div class="flex items-center gap-1.5 text-primary animate-fade-in">
      <IconCircleCheck size={20} stroke={1.5} class="size-3.5" />
      <span>无冲突</span>
    </div>
  {/if}

  <span class="ml-3 text-muted-foreground/70">流程图</span>
  <RunState></RunState>
{/if}
