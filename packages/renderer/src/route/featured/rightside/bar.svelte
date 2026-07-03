<!-- featured/rightside/bar.svelte -->
<script lang="ts">
  import PanelHeader from "$lib/components/pannel-header.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import autoAnimate from "@formkit/auto-animate";
  import { IconPointFilled } from "@tabler/icons-svelte";
  import BarHeader from "./bar.header.svelte";
  import { rightPanelStore } from "./bar.store.svelte";
  import ChatComponet from "./chat/Main.svelte";

  let isMaximized = $derived(layoutStore.maximizedPanel === "right");

  // ── Mock：时间线数据 ──
  const timelineItems = [
    {
      id: "tl-1",
      label: "Modified layout.svelte",
      time: "2 分钟前",
      author: "You",
    },
    {
      id: "tl-2",
      label: "Added sidebar state",
      time: "15 分钟前",
      author: "You",
    },
    {
      id: "tl-3",
      label: "Initial commit",
      time: "1 小时前",
      author: "System",
    },
  ];
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
      {#if rightPanelStore.activeTab === "outline"}
        <div class="space-y-0.5" use:autoAnimate>
          <ChatComponet />
        </div>
      {:else if rightPanelStore.activeTab === "timeline"}
        <div class="space-y-1 pt-1" use:autoAnimate>
          {#each timelineItems as item (item.id)}
            <div
              class="flex items-start gap-2.5 rounded-xl p-2 transition-all duration-200 hover:bg-accent/60"
            >
              <IconPointFilled class="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium text-foreground/90">
                  {item.label}
                </p>
                <p class="text-xs text-muted-foreground">
                  {item.author} · {item.time}
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
