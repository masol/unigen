<!-- packages/renderer/src/lib/components/leftside/model-config/ModelConfigHeader.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { modelConfigStore } from "$lib/store/local/model-config.store.svelte";
  import { IconRefresh } from "@tabler/icons-svelte";

  // 本组件通过 headerComponent 注入 PanelHeader，
  // 运行在固定 h-9 (36px) 的面板头部内，所有控件必须收敛进该高度。
  // 标题与图标由 PanelHeader 渲染，此处只承载「状态 + 复位」。
  let { isMaximized = false }: { isMaximized?: boolean } = $props();
</script>

<div
  class="flex h-full w-full min-w-0 items-center justify-between gap-1.5 px-1"
>
  <!-- 左侧：覆盖 / 异步状态 -->
  <div class="flex min-w-0 items-center gap-1.5">
    {#if modelConfigStore.saveError}
      <span
        class="truncate text-xs text-destructive"
        title={modelConfigStore.saveError}
      >
        保存失败
      </span>
    {:else if modelConfigStore.isSaving}
      <span class="truncate text-xs text-muted-foreground">保存中…</span>
    {:else if modelConfigStore.isLoading}
      <span class="truncate text-xs text-muted-foreground/60">加载中…</span>
    {:else if modelConfigStore.isDirty}
      <span
        class="flex min-w-0 items-center gap-1.5 text-xs text-primary animate-fade-in"
      >
        <span class="size-1.5 shrink-0 rounded-full bg-primary"></span>
        <span class="truncate">{modelConfigStore.overrideCount} 项覆盖</span>
      </span>
    {:else if isMaximized}
      <span class="truncate text-xs text-muted-foreground/60">全部未覆盖</span>
    {/if}
  </div>

  <!-- 右侧：仅在改动时出现 -->
  {#if modelConfigStore.isDirty && !modelConfigStore.isLoading}
    <Button
      variant="ghost"
      size="sm"
      class="h-7 shrink-0 gap-1 rounded-lg px-2 text-xs text-primary transition-all duration-200 hover:bg-primary/10 hover:text-primary animate-fade-in"
      onclick={() => modelConfigStore.resetAll()}
    >
      <IconRefresh size={14} stroke={1.5} />
      复位
    </Button>
  {/if}
</div>
