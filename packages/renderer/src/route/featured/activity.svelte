<script lang="ts">
  // ── Tabler Icons ──
  import { RuntimeIcon } from "$lib/components/runtimeicon";
  import { Separator } from "$lib/components/ui/separator";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { layoutStore } from "$lib/store/ui/layout.svelte";
  import type { LeftSidebarItem } from "$lib/utils/plugin/extpoint/leftsidebar";

  /**
   * 解析角标展示文本。
   * - 0 / 负数 / 非有限数 / 空值 → 不展示，避免活动栏出现无意义 “0”。
   * - 超过 99 → 99+，控制宽度，避免挤压图标。
   */
  function resolveBadge(item: LeftSidebarItem): string | null {
    const source = item.badge;
    const value = typeof source === "function" ? source() : source;

    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }

    const count = Math.trunc(value);

    if (count <= 0) return null;

    return count > 99 ? "99+" : String(count);
  }
</script>

<div
  class="flex flex-col justify-between border-r border-border/50 bg-muted/30 w-12 shrink-0"
>
  <!-- 上部按钮组 -->
  <div class="flex flex-col items-center gap-0.5 pt-1">
    {#each layoutStore.topActivities as activity (activity.id)}
      {@const badge = resolveBadge(activity)}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              aria-label={badge
                ? `${activity.label}（${badge}）`
                : activity.label}
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
              <RuntimeIcon name={activity.icon} class="size-5" />
              {#if badge}
                <span
                  class="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums shadow-sm ring-2 ring-background"
                  aria-hidden="true"
                >
                  {badge}
                </span>
              {/if}
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
    <!-- <Tooltip.Root>
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
    </Tooltip.Root> -->
    <Separator class="my-1 w-6" />

    {#each layoutStore.bottomActivities as activity (activity.id)}
      {@const badge = resolveBadge(activity)}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              id="botactivity-{activity.id}"
              aria-label={badge
                ? `${activity.label}（${badge}）`
                : activity.label}
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
              <RuntimeIcon name={activity.icon} class="size-5" />
              {#if badge}
                <span
                  class="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums shadow-sm ring-2 ring-background"
                  aria-hidden="true"
                >
                  {badge}
                </span>
              {/if}
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
