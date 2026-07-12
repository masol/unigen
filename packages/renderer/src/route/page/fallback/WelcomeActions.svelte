<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { projectStore } from "$lib/store/project.svelte";
  import {
    IconFolderOpen,
    IconFolderPlus,
    IconLoader2,
  } from "@tabler/icons-svelte";

  async function handleOpenProject() {
    await projectStore.open();
  }

  async function handleNewProject() {
    await projectStore.create();
  }
</script>

<div class="flex gap-3 pt-2">
  <Button
    class="rounded-xl"
    disabled={projectStore.isBusy}
    onclick={handleOpenProject}
  >
    {#if projectStore.loading === "open"}
      <IconLoader2 class="size-4 animate-spin" stroke={1.5} />
    {:else}
      <IconFolderOpen class="size-4" stroke={1.5} />
    {/if}
    打开项目
  </Button>

  <Button
    variant="outline"
    class="rounded-xl"
    disabled={projectStore.isBusy}
    onclick={handleNewProject}
  >
    {#if projectStore.loading === "new"}
      <IconLoader2 class="size-4 animate-spin" stroke={1.5} />
    {:else}
      <IconFolderPlus class="size-4" stroke={1.5} />
    {/if}
    新建项目
  </Button>
</div>
