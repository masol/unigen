<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { configStore } from "$lib/store/config.svelte";
  import { pluginStore } from "$lib/store/plugin.svelte";
  import { IconFolderOpen, IconFolderPlus } from "@tabler/icons-svelte";

  interface Props {
    onOpenProject?: () => void;
    onNewProject?: () => void;
  }
  let { onOpenProject, onNewProject }: Props = $props();
</script>

<div class="flex gap-3 pt-2">
  <Button class="rounded-xl" onclick={onOpenProject}>
    <IconFolderOpen class="size-4" />
    打开项目
  </Button>
  <Button variant="outline" class="rounded-xl" onclick={onNewProject}>
    <IconFolderPlus class="size-4" />
    新建项目({pluginStore.getPluginName(configStore.projectype)})
  </Button>
</div>
