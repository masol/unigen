<script lang="ts">
  import { cn } from "$lib/utils/index";
  import { IconFile } from "@tabler/icons-svelte";
  import type { TreeViewFileProps } from "./types";

  let {
    name,
    icon,
    type = "button",
    class: className,
    ...rest
  }: TreeViewFileProps = $props();
</script>

<button
  {type}
  class={cn("flex place-items-center gap-1 pl-0.75", className)}
  {...rest}
>
  {#if icon}
    {@render icon({ name })}
  {:else}
    <IconFile class="size-4" />
  {/if}
  <span>{name}</span>
</button>
