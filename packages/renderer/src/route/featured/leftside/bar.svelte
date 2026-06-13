<!-- $lib/components/LeftSidebar.svelte -->
<script lang="ts">
  import { layoutStore } from "$lib/store/layout.svelte";
  import PanelHeader from "$lib/components/pannel-header.svelte";
  import PanelFallback from "./fallback.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";

  // 获取当前激活的活动项
  let currentItem = $derived(layoutStore.activeActivityItem);

  // 获取面板标题
  let panelTitle = $derived(
    currentItem?.label ?? layoutStore.activeActivity ?? "",
  );

  // 获取面板图标
  let panelIcon = $derived(currentItem?.icon);

  // 获取左侧栏的 header 组件
  let headerComponent = $derived(layoutStore.leftHeaderComponent);
</script>

<div class="flex h-full flex-col border-r border-border/50 bg-muted/20">
  <!-- Panel header -->
  <PanelHeader
    title={panelTitle}
    icon={panelIcon}
    isMaximized={layoutStore.maximizedPanel === "left"}
    onToggleMaximize={() => layoutStore.toggleMaximizePanel("left")}
    onClose={() => layoutStore.closePanel("left")}
    showMaximize={true}
    showClose={true}
    {headerComponent}
  />

  <!-- Panel content -->
  <ScrollArea class="flex-1">
    <div class="p-2">
      {#if currentItem?.component}
        <currentItem.component />
      {:else}
        <PanelFallback activityId={layoutStore.activeActivity ?? ""} />
      {/if}
    </div>
  </ScrollArea>
</div>
