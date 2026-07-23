<!-- src/lib/flow/FlowCanvas.svelte -->
<script lang="ts">
  import {
    Background,
    Controls,
    MiniMap,
    Panel,
    SvelteFlow,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  import { Skeleton } from "$lib/components/ui/skeleton";
  import ArtifactDetailPanel from "./ArtifactDetailPanel.svelte";
  import ArtifactEdge from "./ArtifactEdge.svelte";
  import DagNode from "./DagNode.svelte";
  import FitController from "./FitController.svelte";
  import SelectedNodePanel from "./SelectedNodePanel.svelte";
  import {
    flowStore,
    type DagFlowEdge,
    type DagFlowNode,
  } from "./store.svelte";

  // ── 主题跟随：监听 <html class="dark">（Tailwind v4 class 切换）──
  function isDark() {
    return (
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
    );
  }

  let dark = $state(false);
  $effect(() => {
    dark = isDark();
    const observer = new MutationObserver(() => {
      dark = isDark();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  });

  // ── xyflow 镜像：store 是唯一真源 ──
  let nodes = $state.raw<DagFlowNode[]>([]);
  let edges = $state.raw<DagFlowEdge[]>([]);

  $effect(() => {
    nodes = flowStore.nodes;
  });
  $effect(() => {
    edges = flowStore.edges;
  });

  const nodeTypes = { dagNode: DagNode };
  const edgeTypes = { artifact: ArtifactEdge };
</script>

<div class="relative h-full w-full">
  {#if flowStore.loading}
    <!--╭─────────────────────────────────────────────────────╮ -->
    <!-- │ [可抽取子组件 → CanvasSkeleton.svelte]              │ -->
    <!-- │ 职责：加载态等尺寸骨架，避免布局抖动                 │ -->
    <!-- ╰─────────────────────────────────────────────────────╯ -->
    <div class="grid h-full w-full place-items-center bg-muted/20 p-12">
      <div class="grid w-full max-w-4xl grid-cols-3 gap-8">
        {#each Array(6) as _, i (i)}
          <Skeleton class="h-32 rounded-2xl" />
        {/each}
      </div>
    </div>
    <!-- ╭─── / CanvasSkeleton ───╮ -->
  {:else if flowStore.lastError}
    <div class="grid h-full w-full place-items-center p-12">
      <div class="text-center">
        <p class="text-sm font-medium text-destructive">加载失败</p>
        <p class="mt-2 text-xs text-muted-foreground">{flowStore.lastError}</p>
      </div>
    </div>
  {:else if flowStore.nodeCount === 0}
    <div class="grid h-full w-full place-items-center p-12">
      <p class="text-sm text-muted-foreground">此层暂无节点</p>
    </div>
  {:else}
    <div class="h-full w-full animate-fade-in">
      <SvelteFlow
        bind:nodes
        bind:edges
        {nodeTypes}
        {edgeTypes}
        colorMode={dark ? "dark" : "light"}
        fitView
        minZoom={0.2}
        maxZoom={2.5}
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onnodeclick={({ node }) => flowStore.selectNode(node.id)}
        onpaneclick={() => {
          flowStore.selectNode(null);
          flowStore.selectArtifact(null);
        }}
      >
        <FitController />
        <Background gap={24} />
        <Controls showLock={false} />
        {#if flowStore.miniMap}
          <MiniMap pannable zoomable />
        {/if}

        <!-- 左：产物详情（点击 IO 打开）—— 与右侧节点面板统一等高 -->
        <Panel position="top-left" class="z-10!">
          <ArtifactDetailPanel />
        </Panel>

        <!-- 右：选中节点详情 -->
        <Panel position="top-right" class="z-10!">
          <SelectedNodePanel />
        </Panel>
      </SvelteFlow>
    </div>
  {/if}
</div>
