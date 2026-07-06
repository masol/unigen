<!-- featured/rightside/bar.svelte -->
<script lang="ts">
  import PanelHeader from "$lib/components/pannel-header.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import BarHeader from "./bar.header.svelte";
  import { rightPanelStore } from "./bar.store.svelte";
  import ChatComponet from "./chat/Main.svelte";
  import Glossary from "./glossary/table.svelte";

  let isMaximized = $derived(layoutStore.maximizedPanel === "right");
</script>

<div class="flex h-full flex-col border-l border-border/50 bg-muted/20">
  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ PanelHeader：BarHeader 作为 headerComponent 传入    │ -->
  <!-- │ BarHeader 通过 store 切换 tab → bar 感知并切换内容  │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <PanelHeader
    {isMaximized}
    onToggleMaximize={() => layoutStore.toggleMaximizePanel("right")}
    onClose={() => layoutStore.closePanel("right")}
    showMaximize={true}
    showClose={true}
    headerComponent={BarHeader}
  />

  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ 内容区：响应 store.activeTab 切换显示               │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <ScrollArea class="flex-1 min-h-0">
    <div class="p-2">
      {#if rightPanelStore.activeTab === "assistant"}
        <div class="space-y-0.5" use:autoAnimate>
          <ChatComponet />
        </div>
      {:else if rightPanelStore.activeTab === "blueprint"}
        <div class="space-y-1 pt-1" use:autoAnimate>
          <Glossary></Glossary>
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
