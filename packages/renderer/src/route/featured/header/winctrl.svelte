<!-- header/winctrl.svelte -->
<script lang="ts">
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { Button } from "$lib/components/ui/button";
  import { windowStore } from "$lib/store/window.svelte";
  import { IconMinus, IconSquare, IconCopy, IconX } from "@tabler/icons-svelte";
</script>

<div class="pointer-events-auto relative z-60 flex items-center">
  <!-- 最小化 -->
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          onclick={() => windowStore.minimize()}
          variant="ghost"
          size="icon"
          class="h-9 w-11 rounded-none hover:bg-accent/80"
        >
          <IconMinus size={16} />
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="z-200">最小化</Tooltip.Content>
  </Tooltip.Root>

  <!-- 最大化 / 还原 -->
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          onclick={() => windowStore.toggleMaximize()}
          variant="ghost"
          size="icon"
          class="h-9 w-11 rounded-none hover:bg-accent/80"
        >
          {#if windowStore.isMaximized}
            <IconCopy size={14} />
          {:else}
            <IconSquare size={13} />
          {/if}
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="z-200">
      {windowStore.maxRestoreTooltip}
    </Tooltip.Content>
  </Tooltip.Root>

  <!-- 关闭 -->
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          onclick={() => windowStore.close()}
          variant="ghost"
          size="icon"
          class="group h-9 w-11 rounded-none"
        >
          <IconX
            size={16}
            class="transition-colors duration-200 group-hover:text-white"
          />
        </Button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content class="z-200">关闭</Tooltip.Content>
  </Tooltip.Root>
</div>

<style>
  :global(.group:last-child:hover) {
    background-color: oklch(0.637 0.237 25.331) !important;
    color: white !important;
  }
</style>
