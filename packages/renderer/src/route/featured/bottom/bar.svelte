<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import PanelHeader from "$lib/components/pannel-header.svelte";
  import BottomPanelTabs from "./bar.header.svelte";
  import { bottomPanelStore } from "./bar.store.svelte";
  import { layoutStore } from "$lib/store/layout.svelte";

  let isMaximized = $derived(layoutStore.maximizedPanel === "bottom");

  const terminalLines = [
    { id: 1, text: "$ pnpm dev", type: "command" as const },
    { id: 2, text: "  VITE v6.3.5 ready in 320 ms", type: "info" as const },
    { id: 3, text: "", type: "blank" as const },
    {
      id: 4,
      text: "  ➜  Local:   http://localhost:5173/",
      type: "success" as const,
    },
    {
      id: 5,
      text: "  ➜  Network: http://192.168.1.42:5173/",
      type: "muted" as const,
    },
    {
      id: 6,
      text: "  ➜  press h + enter to show help",
      type: "muted" as const,
    },
    { id: 7, text: "", type: "blank" as const },
    {
      id: 8,
      text: "12:34:56 [vite] hmr update /src/route/layout.svelte",
      type: "info" as const,
    },
  ];
</script>

<div class="flex h-full flex-col border-t border-border/50 bg-muted/20">
  <PanelHeader
    {isMaximized}
    onToggleMaximize={() => layoutStore.toggleMaximizePanel("bottom")}
    onClose={() => layoutStore.closePanel("bottom")}
    showClose
    headerComponent={BottomPanelTabs}
  />

  <ScrollArea class="flex-1">
    <div class="p-3 font-mono text-xs leading-5">
      {#if bottomPanelStore.activeTab === "terminal"}
        {#each terminalLines as line (line.id)}
          <div
            class={[
              line.type === "command" && "text-foreground font-medium",
              line.type === "info" && "text-primary",
              line.type === "success" && "text-green-500 dark:text-green-400",
              line.type === "muted" && "text-muted-foreground",
              line.type === "blank" && "h-4",
            ]}
          >
            {line.text}
          </div>
        {/each}
        <div class="flex items-center gap-1 pt-1">
          <span class="text-primary">$</span>
          <span class="inline-block h-3.5 w-1.5 animate-pulse bg-foreground/70"
          ></span>
        </div>
      {:else if bottomPanelStore.activeTab === "problems"}
        <p class="text-muted-foreground p-2">目前未检测到工作区中的问题。</p>
      {:else if bottomPanelStore.activeTab === "output"}
        <p class="text-muted-foreground p-2">暂无输出内容。</p>
      {/if}
    </div>
  </ScrollArea>
</div>
