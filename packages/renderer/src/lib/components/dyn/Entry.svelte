<!-- src/lib/components/dyn/Entry.svelte -->
<script lang="ts">
  import type { IValueService } from "$lib/store/ui/activity/type";
  import NodeRenderer from "./NodeRenderer.svelte";
  import type { PanelNode } from "./ast";

  // setupActivities 注入的 props：ast 为内联的根 PanelNode，service 为其数据服务。
  let {
    ast,
    service,
  }: {
    ast: PanelNode;
    service: IValueService;
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
