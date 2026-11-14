<script lang="ts">
  import { cn } from "$lib/utils/index";
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    ...restProps
  }: ContextMenuPrimitive.GroupHeadingProps & {
    inset?: boolean;
  } = $props();
</script>

<ContextMenuPrimitive.GroupHeading
  bind:ref
  data-slot="context-menu-group-heading"
  data-inset={inset}
  class={cn(
    "text-muted-foreground px-2.5 py-1.5 text-xs data-inset:pl-9",
    className,
  )}
  {...restProps}
/>
