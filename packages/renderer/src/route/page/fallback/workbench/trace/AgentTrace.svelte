<!-- Trace 根渲染：接收节点数组，交给递归 TraceNode -->
<script lang="ts">
  import type { TraceNode as TraceNodeData } from "$lib/store/local/chat.types";
  import TraceNode from "./TraceNode.svelte";

  let {
    nodes,
    autoExpand = false,
  }: {
    nodes: TraceNodeData[];
    /**
     * 是否允许自动展开有子节点的 trace 节点。
     * 由 AssistantMessage 依据「消息是否处于思考阶段」计算后传入：
     * 思考进行中且尚未输出正文时为 true，否则为 false（历史对话默认 false）。
     */
    autoExpand?: boolean;
  } = $props();

  // 防御：即便上游传入空值或非数组，也不应打断渲染
  let safeNodes = $derived<TraceNodeData[]>(Array.isArray(nodes) ? nodes : []);
</script>

<!-- 不用 Trace.Root 包裹，直接渲染节点列表 -->
{#if safeNodes.length > 0}
  <div class="flex flex-col gap-1">
    {#each safeNodes as node (node.id)}
      <TraceNode {node} {autoExpand} />
    {/each}
  </div>
{/if}
