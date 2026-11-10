<script lang="ts">
  import { IconPaperclip } from "@tabler/icons-svelte";

  let {
    count = 0,
    open = false,
    disabled = false,
    onTrigger = () => {},
  }: {
    /** 已选择文件数量，用于角标与 aria 描述 */
    count?: number;
    /** 上浮菜单是否展开 */
    open?: boolean;
    disabled?: boolean;
    onTrigger?: () => void;
  } = $props();
</script>

<button
  type="button"
  data-attachment-trigger
  {disabled}
  onclick={onTrigger}
  title={count > 0 ? `已选择 ${count} 个文件，点击查看` : "附加文件"}
  aria-label={count > 0 ? `已选择 ${count} 个文件，点击查看` : "附加文件"}
  aria-expanded={count > 0 ? open : undefined}
  aria-haspopup={count > 0 ? "dialog" : undefined}
  class="group relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-90 active:bg-accent/80 disabled:cursor-not-allowed disabled:hover:bg-transparent"
>
  <IconPaperclip
    size={18}
    stroke={1.5}
    class="transition-transform duration-200 group-active:scale-110"
  />
  {#if count > 0}
    <span
      class="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
      aria-hidden="true"
    >
      {count > 99 ? "99+" : count}
    </span>
  {/if}
</button>
