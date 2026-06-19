<!-- featured/rightside/bar.svelte -->
<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconBrandSvelte,
    IconSourceCode,
    IconFileCode,
    IconPointFilled,
  } from "@tabler/icons-svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import PanelHeader from "$lib/components/pannel-header.svelte";
  import BarHeader from "./bar.header.svelte";
  import { rightPanelStore } from "./bar.store.svelte";
  import { layoutStore } from "$lib/store/ui/layout.svelte";

  let isMaximized = $derived(layoutStore.maximizedPanel === "right");

  // ── Mock：大纲数据 ──
  const outlineItems = [
    { id: "ol-1", label: "HeaderBar", kind: "component", depth: 0 },
    { id: "ol-2", label: "ActivityBar", kind: "region", depth: 0 },
    { id: "ol-3", label: "topActivities", kind: "variable", depth: 1 },
    { id: "ol-4", label: "bottomActivities", kind: "variable", depth: 1 },
    { id: "ol-5", label: "LeftSidebar", kind: "region", depth: 0 },
    { id: "ol-6", label: "fileTree", kind: "variable", depth: 1 },
    { id: "ol-7", label: "MainContent", kind: "region", depth: 0 },
    { id: "ol-8", label: "BottomPanel", kind: "region", depth: 0 },
    { id: "ol-9", label: "RightSidebar", kind: "region", depth: 0 },
  ];

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

<div class="flex h-full w-full flex-col bg-background">
  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ PanelHeader：BarHeader 作为 headerComponent 传入    │ -->
  <!-- │ BarHeader 通过 store 切换 tab → bar 感知并切换内容  │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <PanelHeader
    {isMaximized}
    onToggleMaximize={() => layoutStore.toggleMaximizePanel("right")}
    onClose={() => layoutStore.closePanel("right")}
    showClose
    headerComponent={BarHeader}
  />

  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ 内容区：响应 store.activeTab 切换显示               │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <ScrollArea class="flex-1">
    <div class="p-2">
      {#if rightPanelStore.activeTab === "outline"}
        <div class="space-y-0.5" use:autoAnimate>
          {#each outlineItems as item (item.id)}
            <button
              class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-all duration-200 hover:bg-accent/60"
              style:padding-left="{item.depth * 12 + 8}px"
            >
              {#if item.kind === "component"}
                <IconBrandSvelte
                  class="size-3.5 shrink-0 text-orange-500 dark:text-orange-400"
                />
              {:else if item.kind === "region"}
                <IconSourceCode class="size-3.5 shrink-0 text-primary" />
              {:else}
                <IconFileCode class="size-3.5 shrink-0 text-muted-foreground" />
              {/if}
              <span class="truncate text-xs text-foreground/90">
                {item.label}
              </span>
            </button>
          {/each}
        </div>
      {:else if rightPanelStore.activeTab === "timeline"}
        <div class="space-y-1 pt-1" use:autoAnimate>
          {#each timelineItems as item (item.id)}
            <div
              class="flex items-start gap-2.5 rounded-xl p-2 transition-all duration-200 hover:bg-accent/60"
            >
              <IconPointFilled class="size-3.5 shrink-0 mt-0.5 text-primary" />
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
