<!-- header/layout.svelte -->
<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { Button } from "$lib/components/ui/button";
  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import { cn } from "$lib/utils";
  import {
    IconLayoutBottombarCollapseFilled,
    IconLayoutSidebarRightCollapseFilled,
    IconLayoutSidebarRightExpand,
    IconLayoutBottombarExpand,
  } from "@tabler/icons-svelte";
</script>

<div class="flex items-center">
  <!-- 底部面板开关 -->
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          onclick={() => layoutStore.togglePanel("bottom")}
          variant="ghost"
          size="icon"
          aria-pressed={layoutStore.isBottomOpen}
          class={cn(
            "size-9 rounded-none hover:bg-accent/80",
            layoutStore.isBottomOpen
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        >
          {#if layoutStore.isBottomOpen}
            <IconLayoutBottombarCollapseFilled size={16} />
          {:else}
            <IconLayoutBottombarExpand size={16} />
          {/if}
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="z-200">
      {layoutStore.isBottomOpen ? "收起底部面板" : "展开底部面板"}
    </Tooltip.Content>
  </Tooltip.Root>

  <!-- 右侧栏开关 -->
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          onclick={() => layoutStore.togglePanel("right")}
          variant="ghost"
          size="icon"
          aria-pressed={layoutStore.isRightOpen}
          class={cn(
            "size-9 rounded-none hover:bg-accent/80",
            layoutStore.isRightOpen
              ? "text-foreground"
              : "text-muted-foreground",
          )}
        >
          {#if layoutStore.isRightOpen}
            <IconLayoutSidebarRightCollapseFilled size={16} />
          {:else}
            <IconLayoutSidebarRightExpand size={16} />
          {/if}
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="z-200">
      {layoutStore.isRightOpen ? "收起右侧栏" : "展开右侧栏"}
    </Tooltip.Content>
  </Tooltip.Root>
</div>
