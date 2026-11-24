<!-- packages/renderer/src/lib/store/local/sess/auto-condition.dialog.svelte -->
<!-- 条件任务对话框（预留）。当前仅展示「即将推出」占位，不修改配置。 -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { DialogComponentProps } from "$lib/types/dialog";
  import { IconFilter } from "@tabler/icons-svelte";
  import type { AutoTaskConfig } from "./session.types";

  type Props = {
    initialConfig?: AutoTaskConfig;
  } & DialogComponentProps<AutoTaskConfig>;

  let { onCancel }: Props = $props();
</script>

<div class="space-y-6 p-6">
  <div class="space-y-1">
    <h2 class="text-lg font-medium">条件任务</h2>
    <p class="text-sm text-muted-foreground">监测到特定条件后发起对话</p>
  </div>

  <div
    class="flex items-start gap-3 rounded-2xl border border-border/50 bg-muted/30 p-4"
  >
    <div
      class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
    >
      <IconFilter class="size-4" stroke={1.5} />
    </div>
    <div class="space-y-0.5">
      <p class="text-sm font-medium">即将推出</p>
      <p class="text-xs text-muted-foreground">该功能正在开发中，敬请期待</p>
    </div>
  </div>

  <div class="flex justify-end gap-2 pt-2">
    <Button variant="outline" class="rounded-xl" onclick={() => onCancel()}>
      关闭
    </Button>
  </div>
</div>
