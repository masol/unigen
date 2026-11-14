<!-- 通用输入栏选择按钮 · 右上角数字角标 · 支持附件/工具/技能复用 -->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    kind,
    count = 0,
    open = false,
    disabled = false,
    hasPopup = true,
    onTrigger = () => {},
    label,
    icon,
  }: {
    /** 菜单标识，用于互斥判断与外部点击识别（对应 data-menu-trigger） */
    kind: string;
    /** 已选项数量 */
    count?: number;
    /** 当前该菜单是否展开 */
    open?: boolean;
    disabled?: boolean;
    /** 附件场景下 files 为空时点击是直接打开系统对话框，无 popup 语义 */
    hasPopup?: boolean;
    onTrigger?: () => void;
    /** 无障碍标签（如"工具"） */
    label: string;
    /** 图标 Snippet，由调用方注入以复用同一套尺寸/线宽 */
    icon: Snippet;
  } = $props();
</script>

<button
  type="button"
  data-menu-trigger={kind}
  {disabled}
  onclick={onTrigger}
  title={count > 0 ? `${label} · 已选 ${count} 项，点击查看` : label}
  aria-label={count > 0 ? `${label} · 已选 ${count} 项` : label}
  aria-expanded={hasPopup ? open : undefined}
  aria-haspopup={hasPopup ? "dialog" : undefined}
  class="group relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 disabled:cursor-not-allowed disabled:hover:bg-transparent"
>
  {@render icon()}
  {#if count > 0}
    <span
      class="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
      aria-hidden="true"
    >
      {count > 99 ? "99+" : count}
    </span>
  {/if}
</button>
