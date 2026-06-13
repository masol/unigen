<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";

  import {
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconEyeOff,
  } from "@tabler/icons-svelte";
  import type { Component, Snippet } from "svelte";

  import type { PanelHeaderComponent } from "$lib/store/layout.svelte";

  let {
    title = "面板",
    isMaximized = false,
    onToggleMaximize,
    onClose,
    showMaximize = true,
    showClose = false,
    icon,
    actions,
    headerComponent = null,
  }: {
    title?: string;
    isMaximized?: boolean;
    onToggleMaximize?: () => void;
    onClose?: () => void;
    showMaximize?: boolean;
    showClose?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: Component<any>;
    actions?: Snippet;
    headerComponent?: PanelHeaderComponent;
  } = $props();

  let HeaderContent = $derived(headerComponent);
  let HeaderIcon = $derived(icon);

  let headerClasses = $derived(
    isMaximized
      ? "bg-primary/10 border-b-2 border-primary/25 dark:bg-primary/15 dark:border-primary/30 px-3"
      : "border-b border-border/50 px-2",
  );

  let titleClasses = $derived(
    isMaximized ? "text-primary" : "text-muted-foreground",
  );

  let iconClasses = $derived(
    isMaximized
      ? "size-4 shrink-0 text-primary transition-colors duration-200"
      : "size-3.5 shrink-0 text-muted-foreground transition-colors duration-200",
  );
</script>

<div
  class={[
    "group/panel-header flex h-9 shrink-0 items-center justify-between gap-2 select-none transition-all duration-200",
    headerClasses,
  ]}
>
  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ 左侧：动态组件 或 默认（状态指示 + 图标 + 标题）   │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <div class="flex h-full min-w-0 flex-1 items-center gap-2">
    {#if HeaderContent}
      <!-- 图标在左侧 -->
      {#if icon && isMaximized}
        <div class="flex h-full shrink-0 items-center">
          <HeaderIcon class={iconClasses}></HeaderIcon>
        </div>
      {/if}
      <!-- 动态组件：h-full + items-center 强制垂直居中 -->
      <div class="flex h-full min-w-0 flex-1 items-center">
        <HeaderContent {isMaximized} />
      </div>
    {:else}
      <!-- 默认标题布局 -->

      {#if isMaximized}
        <span class="relative flex size-2 shrink-0">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75"
          ></span>
          <span class="relative inline-flex size-2 rounded-full bg-primary"
          ></span>
        </span>
      {/if}

      {#if icon}
        <HeaderIcon class={iconClasses}></HeaderIcon>
      {/if}

      <span
        class={[
          "truncate text-xs font-semibold uppercase tracking-widest transition-colors duration-200",
          titleClasses,
        ]}
      >
        {title}
      </span>

      {#if isMaximized}
        <Badge
          variant="outline"
          class="shrink-0 rounded-lg border-primary/20 bg-primary/15 px-1.5 py-0 text-[10px] font-medium leading-5 text-primary dark:border-primary/30 dark:bg-primary/20"
        >
          全屏
        </Badge>
      {/if}
    {/if}
  </div>

  <!-- ╭─────────────────────────────────────────────────────╮ -->
  <!-- │ 右侧：自定义操作插槽 + 最大化 / 关闭按钮           │ -->
  <!-- ╰─────────────────────────────────────────────────────╯ -->
  <div
    class={[
      "flex h-full shrink-0 items-center gap-0.5",
      isMaximized
        ? "opacity-0 transition-opacity duration-200 group-hover/panel-header:opacity-100"
        : "",
    ]}
  >
    {#if actions}
      {@render actions()}
    {/if}

    {#if showMaximize && onToggleMaximize}
      <Button
        variant="ghost"
        size="icon"
        class={[
          "size-6 transition-all duration-200",
          isMaximized
            ? "rounded-xl text-primary hover:bg-primary/15 hover:text-primary"
            : "rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        ]}
        onclick={onToggleMaximize}
      >
        {#if isMaximized}
          <IconArrowsMinimize class="size-3.5" />
        {:else}
          <IconArrowsMaximize class="size-3.5" />
        {/if}
      </Button>
    {/if}

    {#if showClose && onClose}
      <Button
        variant="ghost"
        size="icon"
        class={[
          "size-6 transition-all duration-200",
          isMaximized
            ? "rounded-xl text-primary hover:bg-primary/15 hover:text-primary"
            : "rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        ]}
        onclick={onClose}
      >
        <IconEyeOff class="size-3.5" />
      </Button>
    {/if}
  </div>
</div>
