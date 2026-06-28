<script lang="ts">
  import * as Accordion from "$lib/components/ui/accordion";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { onMount } from "svelte";

  import ScriptLibrary from "./ScriptLibrary.svelte";
  import { inputStore } from "./store.svelte";
  import ReferenceStylePanel from "./ReferenceStylePanel.svelte";

  onMount(() => {
    inputStore.init();
  });
</script>

<!-- Accordion 区域：两个可独立折叠的区 -->
<ScrollArea class="flex-1 pr-1">
  <Accordion.Root type="multiple" class="space-y-3">
    <ScriptLibrary />
    <ReferenceStylePanel />
  </Accordion.Root>
</ScrollArea>
