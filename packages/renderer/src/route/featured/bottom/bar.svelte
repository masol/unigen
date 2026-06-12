<script lang="ts">
  import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconX,
    IconTerminal2,
    IconAlertTriangle,
    IconNote,
  } from "@tabler/icons-svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { layoutStore } from "$lib/store/layout.svelte";
  // import { dialogStore, DialogCancelledError } from "$lib/store/dialog.svelte";
  // import ConfirmDialog from "$lib/components/dialog/Confirm.svelte";

  const terminalLines = [
    { id: 1, text: "$ pnpm dev", type: "command" as const },
    { id: 2, text: "  VITE v6.3.5ready in 320 ms", type: "info" as const },
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
  <!-- Panel header with tabs -->
  <div
    class="flex h-9 shrink-0 items-center justify-between border-b border-border/50 px-2"
  >
    <div class="flex items-center gap-0.5">
      {#each [{ id: "problems", label: "问题", icon: IconAlertTriangle, badge: 0 }, { id: "output", label: "输出", icon: IconNote, badge: 0 }, { id: "terminal", label: "终端", icon: IconTerminal2, badge: 0 }] as tab (tab.id)}
        <button
          class={[
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all duration-200",
            layoutStore.bottomActiveTab === tab.id
              ? "bg-accent/70 text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
          ]}
          onclick={() => layoutStore.setBottomActiveTab(tab.id)}
        >
          <tab.icon class="size-3.5" />
          {tab.label}
          {#if tab.badge > 0}
            <span
              class="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
            >
              {tab.badge}
            </span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="flex items-center gap-0.5">
      <button
        class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
        onclick={() => layoutStore.toggleMaximizePanel("bottom")}
      >
        {#if layoutStore.maximizedPanel === "bottom"}
          <IconArrowsMinimize class="size-3.5" />
        {:else}
          <IconArrowsMaximize class="size-3.5" />
        {/if}
      </button>
      <button
        class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
        onclick={() => layoutStore.closePanel("bottom")}
      >
        <IconX class="size-3.5" />
      </button>
    </div>
  </div>

  <!-- Panel body -->
  <ScrollArea class="flex-1">
    <div class="p-3 font-mono text-xs leading-5">
      {#if layoutStore.bottomActiveTab === "terminal"}
        {#each terminalLines as line (line.id)}
          <div
            class={[
              line.type === "command" && "text-foreground font-medium",
              line.type === "info" && "text-primary",
              line.type === "success" && "text-green-500dark:text-green-400",
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
      {:else if layoutStore.bottomActiveTab === "problems"}<p
          class="text-muted-foreground p-2"
        >
          目前未检测到工作区中的问题。
        </p>
      {:else if layoutStore.bottomActiveTab === "output"}
        <p class="text-muted-foreground p-2">暂无输出内容。</p>
      {/if}
    </div>
  </ScrollArea>
</div>
