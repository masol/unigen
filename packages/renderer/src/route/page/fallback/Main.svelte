<script lang="ts">
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import type { Snippet } from "svelte";
  import WelcomeScreen from "./WelcomeScreen.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import Dashboard from "./Dashboard.svelte";

  interface Props {
    children?: Snippet;
  }
  let { children }: Props = $props();
</script>

<ScrollArea class="h-full">
  <div class="h-full w-full">
    {#if children}
      {@render children()}
    {:else if projectStore.opened}
      <Dashboard></Dashboard>
    {:else}
      <WelcomeScreen />
    {/if}
  </div>
</ScrollArea>
