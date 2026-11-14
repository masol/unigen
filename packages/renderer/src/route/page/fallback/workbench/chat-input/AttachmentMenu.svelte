<!-- 已选附件清单 · 复用 PickerMenuHeader（计数/清空/关闭）· 单行点击打开 · 悬停移除 -->
<!--
  长文件名防御：
  - 行 div w-full min-w-0 + 文件名 span min-w-0 flex-1 truncate
  - 文本容器加 overflow-hidden 与 flex 收缩同层生效，确保 ... 出现
  原生 title 策略：整行只挂一个 title（完整路径），文件名 span 不再重复挂 title
-->
<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { safeApi } from "$lib/utils/api";
  import autoAnimate from "@formkit/auto-animate";
  import { IconFile, IconPlus, IconTrash } from "@tabler/icons-svelte";
  import PickerMenuHeader from "./PickerMenuHeader.svelte";

  let {
    files = [],
    onRemove = () => {},
    onAdd = () => {},
    onClearAll = () => {},
    onClose = () => {},
  }: {
    files?: string[];
    onRemove?: (path: string) => void;
    onAdd?: () => void;
    onClearAll?: () => void;
    onClose?: () => void;
  } = $props();

  let container = $state<HTMLDivElement>();

  function basename(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  function openFile(path: string) {
    void safeApi().system.openPath({ path });
  }

  // 外部点击关闭：识别触发按钮（data-menu-trigger="attachments"）
  $effect(() => {
    if (typeof document === "undefined") return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!container || !target) return;
      if (container.contains(target)) return;
      if (target.closest('[data-menu-trigger="attachments"]')) return;
      onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
    };
  });

  // ESC 关闭
  $effect(() => {
    if (typeof window === "undefined") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

<div
  bind:this={container}
  class="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border border-border/50 bg-popover shadow-xl animate-slide-up"
  role="dialog"
  aria-label="已选文件"
>
  <PickerMenuHeader
    title="已选文件"
    count={files.length}
    onClear={onClearAll}
    {onClose}
  />

  <div class="max-h-56 overflow-y-auto overflow-x-hidden p-1.5" use:autoAnimate>
    {#each files as file, index (file)}
      <div
        title={file}
        class="group flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
      >
        <span
          class="min-w-5 shrink-0 text-right text-xs leading-none tabular-nums text-muted-foreground/70"
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <button
          type="button"
          onclick={() => openFile(file)}
          class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label={`打开 ${basename(file)}`}
          title={`打开 ${basename(file)}`}
        >
          <IconFile size={14} stroke={1.5} />
        </button>
        <span class="min-w-0 flex-1 overflow-hidden">
          <span class="block truncate text-xs text-foreground">
            {basename(file)}
          </span>
        </span>
        <button
          type="button"
          onclick={() => onRemove(file)}
          class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-200 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
          aria-label={`移除 ${basename(file)}`}
          title={`移除 ${basename(file)}`}
        >
          <IconTrash size={13} stroke={1.5} />
        </button>
      </div>
    {/each}
  </div>

  <div class="flex items-center gap-2 border-t border-border/50 p-2">
    <Button
      variant="secondary"
      class="h-9 flex-1 gap-1.5 rounded-lg"
      onclick={onAdd}
    >
      <IconPlus size={15} stroke={1.5} />
      <span>继续添加</span>
    </Button>
  </div>
</div>
