<!-- 通用菜单头部 · 附件 / 工具 / 技能面板共用 · 标题 + 已选计数 + 清空 + 关闭 -->
<script lang="ts">
  import { IconTrash, IconX } from "@tabler/icons-svelte";

  let {
    title,
    count = 0,
    onClear = () => {},
    onClose = () => {},
  }: {
    title: string;
    count?: number;
    onClear?: () => void;
    onClose?: () => void;
  } = $props();
</script>

<div
  class="flex items-center justify-between border-b border-border/50 px-3 py-2"
>
  <div class="flex items-center gap-2">
    <p class="text-xs font-medium text-foreground">{title}</p>
    {#if count > 0}
      <span
        class="rounded-md bg-primary/10 px-1.5 py-px text-[10px] font-medium tabular-nums text-primary"
      >
        已选 {count}
      </span>
    {/if}
  </div>
  <div class="flex items-center gap-0.5">
    {#if count > 0}
      <button
        type="button"
        onclick={onClear}
        class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        title="清除全部"
        aria-label="清除全部"
      >
        <IconTrash size={13} stroke={1.5} />
      </button>
    {/if}
    <button
      type="button"
      onclick={onClose}
      class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="关闭"
      aria-label="关闭"
    >
      <IconX size={14} stroke={1.5} />
    </button>
  </div>
</div>
