<!-- Trace 根渲染：接收节点数组，交给递归 TraceNode -->
<script lang="ts">
  import * as Trace from "$lib/components/ui/trace";
  import type { TraceNode as TraceNodeData } from "$lib/store/local/chat.types";
  import TraceNode from "./TraceNode.svelte";

  let { nodes }: { nodes: TraceNodeData[] } = $props();
</script>

{#if nodes.length > 0}
  <Trace.Root>
    {#each nodes as node (node.id)}
      <TraceNode {node} />
    {/each}
  </Trace.Root>
{/if}
