<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { safeApi } from "$lib/utils/api";
  import { IconFile, IconPlus, IconTrash, IconX } from "@tabler/icons-svelte";

  let {
    files = [],
    onRemove = () => {},
    onAdd = () => {},
    onClose = () => {},
  }: {
    files?: string[];
    onRemove?: (path: string) => void;
    onAdd?: () => void;
    onClose?: () => void;
  } = $props();

  let container = $state<HTMLDivElement>();

  function basename(path: string): string {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
  }

  // 使用系统默认程序打开文件；不关心结果，调用后即忘
  function openFile(path: string) {
    void safeApi().system.openPath({ path });
  }

  $effect(() => {
    if (typeof document === "undefined") return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!container || !target) return;
      if (container.contains(target)) return;
      if (target.closest("[data-attachment-trigger]")) return;
      onClose();
    };
    // 延迟注册，避免触发按钮的本次点击立即关闭菜单
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
    };
  });

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
  aria-label="已选择的文件"
>
  <div
    class="flex items-center justify-between border-b border-border/50 px-3 py-2"
  >
    <p class="text-xs font-medium text-foreground">
      已选择 {files.length} 个文件
    </p>
    <button
      type="button"
      onclick={onClose}
      class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label="关闭文件列表"
      title="关闭"
    >
      <IconX size={14} stroke={1.5} />
    </button>
  </div>

  <div class="max-h-56 overflow-y-auto p-1.5">
    {#each files as file, index (file)}
      <div
        class="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
      >
        <span
          class="min-w-5 shrink-0 text-right text-[11px] leading-none tabular-nums text-muted-foreground/70"
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
        <span
          class="min-w-0 flex-1 truncate text-xs text-foreground"
          title={file}
        >
          {basename(file)}
        </span>
        <button
          type="button"
          onclick={() => onRemove(file)}
          class="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-150 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
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
