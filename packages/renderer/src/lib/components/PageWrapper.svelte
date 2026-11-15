<script lang="ts">
  import {
    registerBeforeLeave,
    unregisterBeforeLeave,
  } from "@keenmate/svelte-spa-router/helpers/navigation-guard";
  import type { Snippet } from "svelte";
  import { onDestroy, onMount } from "svelte";

  interface Props {
    beforeLeave?: (ctx: unknown) => Promise<void> | void;
    children?: Snippet;
  }

  let { beforeLeave = undefined, children }: Props = $props();

  onMount(() => {
    if (beforeLeave) {
      registerBeforeLeave(beforeLeave);
    }
  });

  onDestroy(() => {
    if (beforeLeave) {
      unregisterBeforeLeave(beforeLeave);
    }
  });
</script>

{@render children?.()}
