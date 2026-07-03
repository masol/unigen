<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { IconAlertTriangle, IconPuzzle } from "@tabler/icons-svelte";

  let { activityId = "" }: { activityId?: string } = $props();
</script>

<div
  class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
>
  <div
    class="flex size-16 items-center justify-center rounded-2xl bg-destructive/10"
  >
    <IconAlertTriangle class="size-8 text-destructive" />
  </div>
  <div class="space-y-2">
    <h3 class="text-lg font-medium">未找到面板组件</h3>
    <p class="text-sm text-muted-foreground">
      ID 为 <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
        >{activityId}</code
      > 的面板尚未注册
    </p>
  </div>
  <div class="space-y-2">
    <p class="text-xs text-muted-foreground">该功能可能需要安装相应的插件</p>
    <Button variant="outline" size="sm" class="gap-2 rounded-xl">
      <IconPuzzle class="size-4" />
      管理插件
    </Button>
  </div>
</div>
