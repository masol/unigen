<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { projectStore } from "$lib/store/project.svelte";
  import type { Snippet } from "svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";
  import Workbench from "./workbench/Workbench.svelte";

  interface Props {
    children?: Snippet;
  }
  let { children }: Props = $props();
</script>

<div class="h-full w-full">
  {#if children}
    {@render children()}
  {:else if projectStore.opened}
    <Workbench />
  {:else}
    <ScrollArea class="h-full">
      <WelcomeScreen />
    </ScrollArea>
  {/if}
</div>
