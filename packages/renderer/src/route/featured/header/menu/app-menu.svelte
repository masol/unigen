<!-- header/app-menu.svelte -->
<script lang="ts">
  import * as Menubar from "$lib/components/ui/menubar";
  import HelpMenu from "./help-menu.svelte";
  import NavigationMenu from "./navigation-menu.svelte";
  import ProjectMenu from "./project-menu.svelte";
  import RunMenu from "./run-menu.svelte";
</script>

<Menubar.Root
  class="h-9 space-x-0 rounded-none border-0 bg-transparent p-0 shadow-none select-none cursor-pointer"
>
  <ProjectMenu />
  <RunMenu />
  <NavigationMenu />
  <HelpMenu />
</Menubar.Root>
