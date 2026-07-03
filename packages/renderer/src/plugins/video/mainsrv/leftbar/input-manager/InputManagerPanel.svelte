<script lang="ts">
  import * as Accordion from "$lib/components/ui/accordion";
  import { ScrollArea } from "$lib/components/ui/scroll-area";

  import CommonPanel from "./CommonPanel.svelte";
  import ReferenceStylePanel from "./ReferenceStylePanel.svelte";
  import ScriptLibrary from "./ScriptLibrary.svelte";

</script>

<!-- Accordion 区域：两个可独立折叠的区 -->
<ScrollArea class="flex-1 pr-1">
  <Accordion.Root type="multiple" class="space-y-3">
    <ScriptLibrary />
    <CommonPanel></CommonPanel>
    <ReferenceStylePanel />
  </Accordion.Root>
</ScrollArea>
