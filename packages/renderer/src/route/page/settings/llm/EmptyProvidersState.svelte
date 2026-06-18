<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { IconServer, IconPlus } from "@tabler/icons-svelte";

  let {
    onAddProvider,
  }: {
    onAddProvider?: () => void;
  } = $props();
</script>

<div
  class="flex animate-fade-in flex-col items-center justify-center space-y-6 py-24"
>
  <div class="flex size-16 items-center justify-center rounded-2xl bg-muted">
    <IconServer size={24} stroke={1.5} class="text-muted-foreground" />
  </div>
  <div class="space-y-2 text-center">
    <h3 class="text-lg font-medium">尚未配置提供商</h3>
    <p class="text-sm text-muted-foreground">
      添加 AI 服务提供商以开始使用模型能力
    </p>
  </div>
  <Button class="gap-2 rounded-xl" onclick={() => onAddProvider?.()}>
    <IconPlus size={16} stroke={1.5} />
    添加提供商
  </Button>
</div>
