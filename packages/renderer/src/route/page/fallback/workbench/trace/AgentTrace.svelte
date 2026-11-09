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
</script>

<!-- !! 关键修复：不用 Trace.Root 包裹，直接渲染节点列表 -->
{#if nodes.length > 0}
  <div class="flex flex-col gap-1">
    {#each nodes as node (node.id)}
      <TraceNode {node} {autoExpand} />
    {/each}
  </div>
{/if}
