<!-- src/lib/components/dyn/nodes/PanelNode.svelte -->
<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import NodeRenderer from "../NodeRenderer.svelte";
  import { keyOf, type PanelNode } from "../ast";
  import type { ValueService } from "../value-service";

  let { node, service }: { node: PanelNode; service: ValueService } = $props();

  let children = $derived(Array.isArray(node.children) ? node.children : []);
</script>

<ScrollArea class="flex-1 pr-1">
  <div class="space-y-3">
    {#each children as child, i (keyOf(child, i))}
      <NodeRenderer node={child} {service} />
    {/each}
  </div>
</ScrollArea>
