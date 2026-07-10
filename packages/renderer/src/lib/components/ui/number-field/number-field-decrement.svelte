<script lang="ts">
  import Button from "$lib/components/button.svelte";
  import { cn } from "$lib/utils";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import { onDestroy } from "svelte";
  import { box } from "svelte-toolbelt";
  import { useNumberFieldButton } from "./number-field.svelte.js";
  import type { NumberFieldButtonProps } from "./types.js";

  let {
    ref = $bindable(null),
    variant = "ghost",
    size = "icon",
    class: className,
    children,
    disabled = false,
    onpointerdown,
    onpointerup,
    onpointerleave,
    onpointercancel,
    onclick,
    tabindex = -1,
    ...rest
  }: NumberFieldButtonProps = $props();

  const buttonState = useNumberFieldButton({
    direction: "down",
    onpointerdown: box.with(() => onpointerdown),
    onpointerup: box.with(() => onpointerup),
    onpointerleave: box.with(() => onpointerleave),
    onpointercancel: box.with(() => onpointercancel),
    onclick: box.with(() => onclick),
    disabled: box.with(() => disabled),
  });

  onDestroy(() => buttonState.destroy());
</script>

<Button
  {variant}
  {size}
  {tabindex}
  bind:ref
  data-slot="number-field-decrement"
  aria-label="Decrease"
  class={cn("touch-manipulation", className)}
  {...buttonState.props}
  {...rest /* eslint-disable-line @typescript-eslint/no-explicit-any */ as any}
>
  {#if children}
    {@render children?.()}
  {:else}
    <MinusIcon />
  {/if}
</Button>
