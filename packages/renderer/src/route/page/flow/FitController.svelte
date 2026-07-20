<!-- src/lib/flow/FitController.svelte -->
<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { flowStore } from "./store.svelte";

  // 必须作为 <SvelteFlow> 的子组件存在，才能拿到 flow context
  const { fitView } = useSvelteFlow();

  $effect(() => {
    void flowStore.fitTrigger;
    void flowStore.currentGraphId;
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 300 });
    });
  });
</script>
