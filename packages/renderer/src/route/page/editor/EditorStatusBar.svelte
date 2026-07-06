<!-- src/lib/editor/EditorStatusBar.svelte -->
<!-- 底部状态栏：只读 editorStore，展示光标/字数/校验结果，零直接通信。 -->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import {
    IconAlertTriangle,
    IconAlignJustified,
    IconCircleCheck,
    IconCircleX,
    IconLetterCase,
    IconMapPin,
    IconTextWrap,
  } from "@tabler/icons-svelte";
  import { editorStore as store } from "./store.svelte";
</script>

<div
  class="flex h-8 shrink-0 items-center gap-4 border-t border-border/50 px-4 text-xs text-muted-foreground"
>
  {#if store.loading}
    <Skeleton class="h-3 w-24 rounded-lg" />
    <Skeleton class="h-3 w-20 rounded-lg" />
    <Skeleton class="ml-auto h-3 w-28 rounded-lg" />
  {:else}
    <!-- 光标位置 -->
    <div class="flex items-center gap-1.5">
      <IconMapPin size={20} stroke={1.5} class="size-3.5" />
      <span>行 {store.cursorLine}，列 {store.cursorColumn}</span>
    </div>

    {#if store.selectionLength > 0}
      <div class="flex items-center gap-1.5 animate-fade-in">
        <IconLetterCase size={20} stroke={1.5} class="size-3.5" />
        <span>已选 {store.selectionLength}</span>
      </div>
    {/if}

    <!-- 字数 / 行数 -->
    <div class="flex items-center gap-1.5">
      <IconAlignJustified size={20} stroke={1.5} class="size-3.5" />
      <span>{store.charCount} 字符 · {store.lineCount} 行</span>
    </div>

    <!-- 换行状态 -->
    {#if store.wordWrap}
      <div class="flex items-center gap-1.5">
        <IconTextWrap size={20} stroke={1.5} class="size-3.5" />
        <span>自动换行</span>
      </div>
    {/if}

    <!-- 右侧：校验结果聚合 -->
    <div class="ml-auto flex items-center gap-3">
      {#if store.errorCount > 0}
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger class="flex items-center gap-1.5 text-destructive">
              <IconCircleX size={20} stroke={1.5} class="size-3.5" />
              <span>{store.errorCount}</span>
              {#if store.warningCount > 0}
                <IconAlertTriangle size={20} stroke={1.5} class="size-3.5" />
                <span>{store.warningCount}</span>
              {/if}
            </Tooltip.Trigger>
            <Tooltip.Content>
              {store.errorCount} 个错误，{store.warningCount} 个警告
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {:else if store.warningCount > 0}
        <div class="flex items-center gap-1.5 text-primary">
          <IconAlertTriangle size={20} stroke={1.5} class="size-3.5" />
          <span>{store.warningCount} 个警告</span>
        </div>
      {:else if store.issues.length === 0 && !store.dirty}
        <div class="flex items-center gap-1.5 text-primary animate-fade-in">
          <IconCircleCheck size={20} stroke={1.5} class="size-3.5" />
          <span>校验通过</span>
        </div>
      {/if}

      <span class="text-muted-foreground/70">{store.kindLabel}</span>
    </div>
  {/if}
</div>
