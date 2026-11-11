<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { configStore } from "$lib/store/config.svelte";
  import {
    IconAlertTriangle,
    IconBrain,
    IconDeviceDesktop,
    IconPlus,
    IconServer,
  } from "@tabler/icons-svelte";

  let {
    providerCount = 0,
    totalModels = 0,
    localModels = 0,
    onAddProvider,
  }: {
    providerCount?: number;
    totalModels?: number;
    localModels?: number;
    onAddProvider?: () => void;
  } = $props();
</script>

<header class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
  <div class="space-y-2">
    <h1 class="text-2xl font-semibold tracking-tight lg:text-3xl">
      AIGC模型配置
    </h1>
    <p
      class="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2"
    >
      <span>管理 AIGC 服务提供商及其支持的模型</span>
      {#if configStore.llmModelCount === 0}
        <span
          class="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5
                   text-[11px] font-semibold tracking-wide
                   text-amber-600 dark:text-amber-400
                   ring-1 ring-inset ring-amber-500/30
                   shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
        >
          <IconAlertTriangle size={12} stroke={2.25} />
          需配置并启用至少一个文本模型
        </span>
      {/if}
    </p>
    <div class="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
      <span class="flex items-center gap-1.5">
        <IconServer size={14} stroke={1.5} />
        {providerCount} 个提供商
      </span>
      <span class="text-border">·</span>
      <span class="flex items-center gap-1.5">
        <IconBrain size={14} stroke={1.5} />
        {totalModels} 个模型
      </span>
      {#if localModels > 0}
        <span class="text-border">·</span>
        <span class="flex items-center gap-1.5">
          <IconDeviceDesktop size={14} stroke={1.5} />
          {localModels} 个本地
        </span>
      {/if}
    </div>
  </div>
  <Button
    class="gap-2 self-start rounded-xl sm:self-auto"
    onclick={() => onAddProvider?.()}
  >
    <IconPlus size={16} stroke={1.5} />
    添加提供商
  </Button>
</header>
