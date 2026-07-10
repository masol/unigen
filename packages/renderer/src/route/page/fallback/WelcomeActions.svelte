<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { projectStore } from "$lib/store/project.svelte";
  import {
    IconFolderOpen,
    IconFolderPlus,
    IconLoader2,
  } from "@tabler/icons-svelte";

  import { dialogStore } from "$lib/store/ui/dialog.svelte";
  import SelectProjectTypeDialog from "./project-type/SelectProjectTypeDialog.svelte";

  async function handleOpenProject() {
    if (projectStore.isBusy) return;
    projectStore.loading = "open";
    try {
      await projectStore.open();
    } finally {
      projectStore.loading = null;
    }
  }

  async function handleNewProject() {
    if (projectStore.isBusy) return;
    projectStore.loading = "new";
    try {
      const typeId = await dialogStore.safeShow(
        SelectProjectTypeDialog,
        {
          // onManage 留给你实现内部路由跳转（非新窗口）
          onManage: () => alert("/settings/project-types"),
        },
        { size: "xl" }, // 宽屏网格，选用 xl
      );
      if (typeId === null) return; // 用户取消
      await projectStore.create();
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
    新建项目
  </Button>
</div>
