<!-- Trace 根渲染：接收节点数组，交给递归 TraceNode -->
<script lang="ts">
  import type { TraceNode as TraceNodeData } from "$lib/store/local/chat.types";
  import TraceNode from "./TraceNode.svelte";

  let { nodes }: { nodes: TraceNodeData[] } = $props();
</script>

<!-- !! 关键修复：不用 Trace.Root 包裹，直接渲染节点列表 -->
{#if nodes.length > 0}
  <div class="flex flex-col gap-1">
    {#each nodes as node (node.id)}
      <TraceNode {node} />
    {/each}
  </div>
{/if}
