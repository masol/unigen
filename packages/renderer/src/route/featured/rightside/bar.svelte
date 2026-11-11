<!-- featured/rightside/bar.svelte -->
<script lang="ts">
  import PanelHeader from "$lib/components/pannel-header.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { rightPanelStore } from "$lib/store/local/rightbar.store.svelte";
  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import BarHeader from "./bar.header.svelte";
  import Glossary from "./glossary/table.svelte";
  import ToolSearch from "./toolsearch/toolsearch.svelte";

  let isMaximized = $derived(layoutStore.maximizedPanel === "right");
</script>

<div class="flex h-full min-w-0 flex-col border-l border-border/50 bg-muted/20">
  <PanelHeader
    {isMaximized}
    onToggleMaximize={() => layoutStore.toggleMaximizePanel("right")}
    onClose={() => layoutStore.closePanel("right")}
    showMaximize={true}
    showClose={true}
    headerComponent={BarHeader}
  />

  <!--
    内容区按分支决定谁负责滚动：
    - blueprint：普通流式内容 → 用 ScrollArea
    - toolsearch：VirtualList 自管滚动 → 直接放在带确定高度的 flex 容器里
      （不要再套 ScrollArea，否则 viewport 的 h-full 会失效）
  -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {#if rightPanelStore.activeTab === "blueprint"}
      <ScrollArea class="h-full">
        <div class="space-y-1 p-2 pt-1" use:autoAnimate>
          <Glossary />
        </div>
      </ScrollArea>
    {:else if rightPanelStore.activeTab === "toolsearch"}
      <!-- ToolSearch 根为 flex flex-1 min-h-0 flex-col，
           依赖本父级是 flex 容器并给出确定高度 -->
      <ToolSearch />
    {/if}
  </div>
</div>
