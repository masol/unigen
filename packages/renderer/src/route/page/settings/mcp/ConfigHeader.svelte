<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import {
    IconPlugConnected,
    IconPlus,
    IconShieldCheck,
    IconUpload,
  } from "@tabler/icons-svelte";

  let {
    serverCount = 0,
    enabledCount = 0,
    onAddServer,
    onImportConfig,
  }: {
    serverCount?: number;
    enabledCount?: number;
    onAddServer?: () => void;
    onImportConfig?: () => void;
  } = $props();
</script>

<header class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">MCP 服务</h1>
    <p class="text-sm text-muted-foreground">
      管理 Model Context Protocol 服务连接参数
    </p>
    <div
      class="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground"
    >
      <span class="flex items-center gap-1.5">
        <IconPlugConnected size={14} stroke={1.5} />
        {serverCount} 个服务
      </span>
      <span class="text-border">·</span>
      <span class="flex items-center gap-1.5">
        <IconShieldCheck size={14} stroke={1.5} />
        {enabledCount} 个启用
      </span>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
    <Button
      variant="outline"
      class="gap-2 rounded-xl"
      onclick={() => onImportConfig?.()}
    >
      <IconUpload size={16} stroke={1.5} />
      导入配置
    </Button>

    <Button class="gap-2 rounded-xl" onclick={() => onAddServer?.()}>
      <IconPlus size={16} stroke={1.5} />
      添加 MCP 服务
    </Button>
  </div>
</header>
