<script lang="ts">
  // ── Tabler Icons ──
  import {
    IconLayoutSidebarRightCollapseFilled,
    IconLayoutSidebarRightExpand,
    IconLayoutBottombarExpand,
    IconLayoutBottombarCollapseFilled,
  } from "@tabler/icons-svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { layoutStore } from "$lib/store/layout.svelte";
  import { Separator } from "$lib/components/ui/separator";
</script>

<div
  class="flex flex-col justify-between border-r border-border/50 bg-muted/30 w-12 shrink-0"
>
  <!-- 上部按钮组 -->
  <div class="flex flex-col items-center gap-0.5 pt-1">
    {#each layoutStore.topActivities as activity (activity.id)}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class={[
                "relative flex size-10 items-center justify-center rounded-lg transition-all duration-200",
                "hover:bg-accent/60",
                layoutStore.activeActivity === activity.id &&
                layoutStore.isLeftOpen
                  ? "text-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-foreground"
                  : "text-muted-foreground",
              ]}
              onclick={() => layoutStore.handleActivityClick(activity.id)}
            >
              <activity.icon class="size-5" />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right" sideOffset={6}>
          <p class="text-xs">{activity.label}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {/each}
  </div>

  <!-- 下部按钮组 -->
  <div class="flex flex-col items-center gap-0.5 pb-2">
    <!-- 快捷面板切换 -->
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class={[
              "flex size-10 items-center justify-center rounded-lg transition-all duration-200 hover:bg-accent/60",
              layoutStore.isBottomOpen
                ? "text-foreground"
                : "text-muted-foreground",
            ]}
            onclick={() => layoutStore.togglePanel("bottom")}
          >
            {#if layoutStore.isBottomOpen}
              <IconLayoutBottombarCollapseFilled class="size-5" />
            {:else}
              <IconLayoutBottombarExpand class="size-5" />
            {/if}
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="right" sideOffset={6}>
        <p class="text-xs">切换面板</p>
      </Tooltip.Content>
    </Tooltip.Root><Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class={[
              "flex size-10 items-center justify-center rounded-lg transition-all duration-200 hover:bg-accent/60",
              layoutStore.isRightOpen
                ? "text-foreground"
                : "text-muted-foreground",
            ]}
            onclick={() => layoutStore.togglePanel("right")}
          >
            {#if layoutStore.isRightOpen}
              <IconLayoutSidebarRightCollapseFilled class="size-5" />
            {:else}
              <IconLayoutSidebarRightExpand class="size-5" />
            {/if}
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content side="right" sideOffset={6}>
        <p class="text-xs">切换辅助侧栏</p>
      </Tooltip.Content>
    </Tooltip.Root>
    <Separator class="my-1 w-6" />

    {#each layoutStore.bottomActivities as activity (activity.id)}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class={[
                "relative flex size-10 items-center justify-center rounded-lg transition-all duration-200",
                "hover:bg-accent/60",
                layoutStore.activeActivity === activity.id &&
                layoutStore.isLeftOpen
                  ? "text-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-foreground"
                  : "text-muted-foreground",
              ]}
              onclick={() => layoutStore.handleActivityClick(activity.id)}
            >
              <activity.icon class="size-5" />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="right" sideOffset={6}>
          <p class="text-xs">{activity.label}</p>
        </Tooltip.Content>
      </Tooltip.Root>
    {/each}
  </div>
</div>
