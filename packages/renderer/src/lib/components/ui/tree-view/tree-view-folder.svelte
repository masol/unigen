<script lang="ts">
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { cn } from "$lib/utils/index.js";
  import { IconFolder, IconFolderOpen } from "@tabler/icons-svelte";
  import type { TreeViewFolderProps } from "./types";

  let {
    name,
    open = $bindable(true),
    forceOpen = false,
    class: className,
    icon,
    children,
  }: TreeViewFolderProps = $props();

  let isOpen = $derived(forceOpen ? true : open);
</script>

<Collapsible.Root
  open={isOpen}
  onOpenChange={(value) => {
    if (!forceOpen) open = value;
  }}
>
  <Collapsible.Trigger class={cn("flex place-items-center gap-1", className)}>
    {#if icon}
      {@render icon({ name, open: isOpen })}
    {:else if isOpen}
      <IconFolderOpen class="size-4" />
    {:else}
      <IconFolder class="size-4" />
    {/if}
    <span>{name}</span>
  </Collapsible.Trigger>
  <Collapsible.Content class="ml-2 border-l">
    <div class="relative flex place-items-start">
      <div class="bg-border mx-2 h-full w-px"></div>
      <div class="flex flex-1 flex-col">
        {@render children?.()}
      </div>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
