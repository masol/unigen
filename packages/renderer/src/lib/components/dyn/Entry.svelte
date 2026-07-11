<!-- src/lib/components/dyn/Entry.svelte -->
<script lang="ts">
  import NodeRenderer from "./NodeRenderer.svelte";
  import type { PanelNode } from "./ast";
  import type { ValueService } from "./value-service";

  // setupActivities 注入的 props：id 用于选 service/ast，ast 可内联
  let {
    ast,
    service,
  }: {
    ast: PanelNode;
    service: ValueService;
  } = $props();
</script>

{#if ast && service}
  <NodeRenderer node={ast} {service} />
{:else}
  <div
    class="flex h-full items-center justify-center text-sm text-muted-foreground"
  >
    加载中…
  </div>
{/if}
