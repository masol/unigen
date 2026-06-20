<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { configStore } from "$lib/store/config.svelte";
  import { pluginStore } from "$lib/store/plugin.svelte";
  import { projectStore } from "$lib/store/project.svelte";
  import {
    IconFolderOpen,
    IconFolderPlus,
    IconLoader2,
  } from "@tabler/icons-svelte";

  async function handleOpenProject() {
    if (projectStore.isBusy) return;
    projectStore.loading = "open";
    try {
      await projectStore.open();
      await new Promise((r) => setTimeout(r, 1200));
    } finally {
      projectStore.loading = null;
    }
  }

  async function handleNewProject() {
    if (projectStore.isBusy) return;
    projectStore.loading = "new";
    try {
      // TODO: 调用新建项目逻辑
      await new Promise((r) => setTimeout(r, 1200));
    } finally {
      projectStore.loading = null;
    }
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
    新建项目({pluginStore.getPluginName(configStore.projectype)})
  </Button>
</div>
