<script lang="ts">
  import autoAnimate from "@formkit/auto-animate";
  import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconX,
    IconFileCode,
    IconBrandSvelte,
    IconSourceCode,
    IconListTree,
    IconClock,
    IconPointFilled,
  } from "@tabler/icons-svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { layoutStore } from "$lib/store/layout.svelte";

  let rightActiveTab = $state<string>("outline");

  // ── Mock outline items ──
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
  <!-- Panel header with tabs -->
  <div
    class="flex h-9 shrink-0 items-center justify-between border-b border-border/50 px-2"
  >
    <div class="flex items-center gap-0.5">
      {#each [{ id: "outline", label: "大纲", icon: IconListTree }, { id: "timeline", label: "时间线", icon: IconClock }] as tab (tab.id)}
        <button
          class={[
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all duration-200",
            rightActiveTab === tab.id
              ? "bg-accent/70 text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
          ]}
          onclick={() => (rightActiveTab = tab.id)}
        >
          <tab.icon class="size-3.5" />
          {tab.label}
        </button>
      {/each}
    </div>
    <div class="flex items-center gap-0.5">
      <button
        class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
        onclick={() => layoutStore.toggleMaximizePanel("right")}
      >
        {#if layoutStore.maximizedPanel === "right"}
          <IconArrowsMinimize class="size-3.5" />
        {:else}
          <IconArrowsMaximize class="size-3.5" />
        {/if}
      </button>
      <button
        class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
        onclick={() => layoutStore.closePanel("right")}
      >
        <IconX class="size-3.5" />
      </button>
    </div>
  </div>

  <!-- Panel body -->
  <ScrollArea class="flex-1">
    <div class="p-2">
      {#if rightActiveTab === "outline"}
        <div class="space-y-0.5" use:autoAnimate>
          {#each outlineItems as item (item.id)}
            <button
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-all duration-200 hover:bg-accent/60"
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
      {:else if rightActiveTab === "timeline"}
        <div class="space-y-1 pt-1" use:autoAnimate>
          {#each timelineItems as item (item.id)}
            <div
              class="flex items-start gap-2.5 rounded-lg p-2 transition-all duration-200 hover:bg-accent/60"
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
