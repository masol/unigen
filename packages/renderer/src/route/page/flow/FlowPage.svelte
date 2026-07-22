<script lang="ts">
  import FlowCanvas from "./FlowCanvas.svelte";
  import FlowToolbar from "./FlowToolbar.svelte";
  import { flowStore } from "./store.svelte";

  let { params = {} }: { params?: { id?: string } } = $props();

  const id = $derived((params.id ?? "").trim());

  $effect(() => {
    flowStore.init(id);
  });
</script>

<div
  class="flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground"
>
  <FlowToolbar />
  <div class="relative min-h-0 flex-1">
    <FlowCanvas />
  </div>
</div>
