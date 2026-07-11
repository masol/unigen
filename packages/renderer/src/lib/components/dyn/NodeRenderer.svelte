<!-- src/lib/components/dyn/NodeRenderer.svelte -->
<script lang="ts">
  import type { DynNode } from "./ast";
  import { resolveNode } from "./registry";
  import type { ValueService } from "./value-service";

  let { node, service }: { node: DynNode; service: ValueService } = $props();
  let Comp = $derived(resolveNode(node.type));
</script>

{#if Comp}
  <Comp {node} {service} />
{:else}
  <div
    class="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive"
  >
    未知节点类型：{node.type}
  </div>
{/if}
